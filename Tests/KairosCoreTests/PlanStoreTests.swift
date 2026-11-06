import Foundation
import Testing

@testable import KairosCore

@Test @MainActor func legacyDraftKeepsAbsolutePositionsAcrossSaveAndReload() throws {
  let name = "KairosTests-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let id = UUID()
  let json = """
    {"id":"\(id)","segments":[
      {"id":"\(UUID())","distance":"169.9","reminder":"Water"},
      {"id":"\(UUID())","distance":"1000","reminder":"喝可乐"},
      {"id":"\(UUID())","distance":"1000","reminder":"喝水"},
      {"id":"\(UUID())","distance":"1000","reminder":"喝水"}
    ]}
    """
  let original = Data(json.utf8)
  defaults.set(original, forKey: PlanStore.storageKey)
  let store = PlanStore(defaults: defaults)
  #expect(store.plan.id == id && store.plan.totalDistance.isEmpty)
  #expect(defaults.data(forKey: PlanStore.storageKey) == original)
  #expect(store.plan.stops.map(\.distance) == ["169.9", "1169.9", "2169.9", "3169.9"])
  store.plan.totalDistance = "5000"
  let restored = PlanStore(defaults: defaults)
  #expect(restored.plan == store.plan && restored.validationMessage == nil)
  let last = restored.plan.stops[3]
  restored.plan.stops.remove(at: 1)
  #expect(try PlanStore(defaults: defaults).plan.points().last?.cumulativeMeters == 3200)
  #expect(restored.plan.stops.last == last)
}

@Test @MainActor func savesAndRestoresEditedPlanAndIdentity() throws {
  let name = "KairosTests-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let store = PlanStore(defaults: defaults)
  #expect(store.plan.stops.isEmpty && store.plan.totalDistance.isEmpty)
  store.plan.totalDistance = "1000"
  store.plan.stops.append(FuelStop(distance: "123.5", reminder: "喝水"))
  store.plan.stops.append(FuelStop(distance: "76.5", reminder: "吃胶"))
  store.plan.stops.removeFirst()
  let restored = PlanStore(defaults: defaults)
  #expect(restored.plan == store.plan)
  #expect(restored.validationMessage == nil)
  #expect(try restored.plan.points()[0].cumulativeMeters == 76.5)
}

@Test @MainActor func corruptStorageIsReportedAndNotOverwrittenUntilEditing() throws {
  let name = "KairosTests-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let corrupt = Data("invalid".utf8)
  defaults.set(corrupt, forKey: PlanStore.storageKey)
  let store = PlanStore(defaults: defaults)
  #expect(store.storageMessage != nil)
  #expect(defaults.data(forKey: PlanStore.storageKey) == corrupt)
  store.plan.totalDistance = "500"
  #expect(store.storageMessage == nil)
  #expect(defaults.data(forKey: PlanStore.storageKey) != corrupt)
}

@Test @MainActor func invalidPlanDoesNotReachSchedulerAndEditingClearsStatus() async throws {
  let name = "KairosTests-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let store = PlanStore(defaults: defaults)
  let scheduler = FakeScheduler()
  await store.send(using: scheduler)
  #expect(scheduler.requests == 0 && scheduler.submissions == 0)
  #expect(store.submissionMessage != nil && !store.isSending)
  store.plan.totalDistance = "1000"
  store.plan.stops.append(FuelStop(distance: "100", reminder: "吃胶"))
  #expect(store.submissionMessage == nil)
  await store.send(using: scheduler)
  #expect(store.submissionMessage?.contains("这不代表手表已收到") == true)
  store.plan.stops[0].distance = "200"
  #expect(store.submissionMessage == nil)
}
