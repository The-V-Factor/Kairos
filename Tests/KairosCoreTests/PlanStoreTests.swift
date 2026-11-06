import Foundation
import Testing

@testable import KairosCore

@Test @MainActor func savesAndRestoresEditedPlanAndIdentity() throws {
  let name = "KairosTests-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let store = PlanStore(defaults: defaults)
  #expect(store.plan.segments.count == 1 && store.plan.segments[0].distance.isEmpty)
  store.plan.segments[0].distance = "123.5"
  store.plan.segments[0].reminder = "喝水"
  store.plan.segments.append(FuelSegment(distance: "76.5", reminder: "吃胶"))
  store.plan.segments.removeFirst()
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
  store.plan.segments[0].distance = "500"
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
  store.plan.segments[0].distance = "100"
  store.plan.segments[0].reminder = "吃胶"
  #expect(store.submissionMessage == nil)
  await store.send(using: scheduler)
  #expect(store.submissionMessage?.contains("这不代表手表已收到") == true)
  store.plan.segments[0].distance = "200"
  #expect(store.submissionMessage == nil)
}
