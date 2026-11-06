import Foundation
import Testing
import WorkoutKit

@testable import KairosCore

@MainActor private func historyStore(_ defaults: UserDefaults) -> PlanStore {
  let store = PlanStore(defaults: defaults)
  store.rideDate = Calendar.current.date(from: DateComponents(year: 2026, month: 11, day: 6))!
  store.plan = FuelPlan(
    totalDistance: "75000",
    stops: [
      FuelStop(distance: "14542", reminder: "喝水", kind: .water)
    ])
  return store
}

@Test @MainActor func historyGroupsByRideDateAndResendUpdatesOnlyThatDay() async throws {
  let name = "KairosHistory-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let store = historyStore(defaults)
  let scheduler = FakeScheduler()
  await store.send(using: scheduler)
  #expect(store.history.count == 1 && store.plan.stops[0].distance == "14500")
  #expect(store.status(for: store.history[0]) == "系统排程中")
  store.plan.stops[0].reminder = "喝两口水"
  await store.send(using: scheduler)
  #expect(store.history.count == 1 && scheduler.entries.count == 1)
  let firstDay = store.history[0]
  #expect(firstDay.fuelPlan?.stops[0].reminder == "喝两口水")
  store.rideDate = Calendar.current.date(byAdding: .day, value: 1, to: store.rideDate)!
  store.plan.stops[0].reminder = "次日喝水"
  await store.send(using: scheduler)
  #expect(store.history.count == 2 && scheduler.entries.count == 2)
  #expect(store.history.first?.day.day == 7)
  #expect(store.history.last?.fuelPlan == firstDay.fuelPlan)
  let restored = PlanStore(defaults: defaults)
  #expect(restored.history == store.history)
  #expect(PlanDay(restored.rideDate) == PlanDay(store.rideDate))
  #expect(restored.status(for: restored.history[0]) == "状态待刷新")
}

@Test @MainActor func refreshRecoversOldSystemPlansAndNeverGuessesWatchReceipt() async throws {
  let name = "KairosHistory-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let store = historyStore(defaults)
  let originalDraft = store.plan
  let workout = try store.plan.workoutPlan()
  let scheduler = FakeScheduler()
  scheduler.entries = [ScheduledWorkoutPlan(workout, date: PlanDay(store.rideDate).components)]
  await store.refreshHistory(using: scheduler)
  let record = try #require(store.history.first)
  #expect(record.workout == workout && record.fuelPlan == nil)
  #expect(store.plan == originalDraft && store.status(for: record) == "系统排程中")
  scheduler.entries[0].complete = true
  await store.refreshHistory(using: scheduler)
  #expect(store.history[0].wasComplete && store.status(for: record) == "系统回报已完成")
  scheduler.entries = []
  await store.refreshHistory(using: scheduler)
  #expect(store.history.count == 1 && store.status(for: store.history[0]) == "已完成（历史回报）")
  scheduler.state = .denied
  await store.refreshHistory(using: scheduler)
  #expect(store.status(for: record) == "曾完成 · 待刷新" && store.scheduledEntry(for: record) == nil)
  #expect(scheduler.requests == 0)
}

@Test @MainActor func removalTargetsPlanAndDateAndPreservesDraftAndHistory() async throws {
  let name = "KairosHistory-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let store = historyStore(defaults)
  let scheduler = FakeScheduler()
  await store.send(using: scheduler)
  let record = try #require(store.history.first)
  let otherDay = DateComponents(year: 2026, month: 11, day: 7)
  scheduler.entries.append(ScheduledWorkoutPlan(try store.plan.workoutPlan(), date: otherDay))
  let unrelated = try FuelPlan(
    totalDistance: "1000", stops: [FuelStop(distance: "100", reminder: "其他计划")]
  ).workoutPlan()
  scheduler.entries.append(ScheduledWorkoutPlan(unrelated, date: record.day.components))
  let draft = store.plan
  await store.refreshHistory(using: scheduler)
  await store.removeSchedule(record, using: scheduler)
  #expect(scheduler.entries.count == 2 && scheduler.removed == [record.workoutID])
  #expect(
    scheduler.entries.contains {
      $0.plan.id == record.workoutID && PlanDay($0.date) == PlanDay(otherDay)
    })
  #expect(scheduler.entries.contains { $0.plan.id == unrelated.id })
  #expect(store.plan == draft && store.history.count == 3)
  #expect(store.status(for: record) == "已撤回排程")
  #expect(store.history.first { $0.id == record.id }?.removedAt != nil)
  #expect(PlanStore(defaults: defaults).history.count == 3)
}

@Test @MainActor func refusedRemovalAndUnavailableQueryDoNotClaimRemoved() async throws {
  let name = "KairosHistory-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let store = historyStore(defaults)
  let scheduler = FakeScheduler()
  await store.send(using: scheduler)
  let record = try #require(store.history.first)
  scheduler.acceptsRemoval = false
  await store.removeSchedule(record, using: scheduler)
  #expect(store.history[0].removedAt == nil && store.scheduleCheckedAt == nil)
  #expect(store.historyMessage?.contains("暂未确认撤回成功") == true)
  scheduler.state = .denied
  await store.removeSchedule(record, using: scheduler)
  #expect(scheduler.removed.count == 1 && scheduler.entries.count == 1)
}

@Test @MainActor func completedRideIsPreservedWhenSendingAnotherRideOnSameDay() async throws {
  let name = "KairosHistory-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let store = historyStore(defaults)
  let scheduler = FakeScheduler()
  await store.send(using: scheduler)
  let completedID = store.plan.id
  scheduler.entries[0].complete = true
  await store.refreshHistory(using: scheduler)
  await store.send(using: scheduler)
  #expect(store.plan.id != completedID && store.history.count == 2)
  #expect(scheduler.entries.contains { $0.plan.id == completedID && $0.complete })
  #expect(!scheduler.removed.contains(completedID))
}

@Test @MainActor func missingScheduleIsNotReportedAsDeletion() async throws {
  let name = "KairosHistory-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let store = historyStore(defaults)
  let scheduler = FakeScheduler()
  await store.send(using: scheduler)
  scheduler.entries = []
  await store.refreshHistory(using: scheduler)
  #expect(store.history.count == 1 && store.history[0].removedAt == nil)
  #expect(store.status(for: store.history[0]) == "当前排程未找到")
}

@Test @MainActor func corruptHistoryIsNotOverwrittenOrSentPast() async throws {
  let name = "KairosHistory-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let corrupt = Data("invalid history".utf8)
  defaults.set(corrupt, forKey: PlanStore.historyKey)
  let store = historyStore(defaults)
  let scheduler = FakeScheduler()
  await store.refreshHistory(using: scheduler)
  await store.send(using: scheduler)
  #expect(defaults.data(forKey: PlanStore.historyKey) == corrupt)
  #expect(scheduler.submissions == 0 && scheduler.removed.isEmpty)
  #expect(store.historyMessage != nil && store.submissionMessage != nil)
}

@Test @MainActor func failedReplacementKeepsHistoryAndInvalidatesScheduleStatus() async throws {
  let name = "KairosHistory-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let store = historyStore(defaults)
  let scheduler = FakeScheduler()
  await store.send(using: scheduler)
  let previous = try #require(store.history.first)
  store.plan.stops[0].reminder = "修改后的提示"
  scheduler.acceptsSchedule = false
  await store.send(using: scheduler)
  #expect(store.history == [previous])
  #expect(store.plan.stops[0].reminder == "修改后的提示")
  #expect(store.status(for: previous) == "状态待刷新")
  #expect(store.submissionMessage?.contains("暂未确认") == true)
  await store.refreshHistory(using: scheduler)
  #expect(store.status(for: previous) == "当前排程未找到")
}

@Test @MainActor func openingHistoryDoesNotPromptUntilUserRequestsRefresh() async throws {
  let name = "KairosHistory-\(UUID())"
  let defaults = try #require(UserDefaults(suiteName: name))
  defer { defaults.removePersistentDomain(forName: name) }
  let store = historyStore(defaults)
  let scheduler = FakeScheduler()
  scheduler.state = .notDetermined
  await store.refreshHistory(using: scheduler)
  #expect(scheduler.requests == 0 && store.scheduleCheckedAt == nil)
  #expect(store.historyMessage?.contains("点右上角刷新") == true)
  await store.refreshHistory(using: scheduler, requestAuthorization: true)
  #expect(scheduler.requests == 1 && store.scheduleCheckedAt != nil)
}
