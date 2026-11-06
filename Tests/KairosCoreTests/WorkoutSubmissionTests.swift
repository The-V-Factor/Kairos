import Foundation
import Testing
import WorkoutKit

@testable import KairosCore

@MainActor
final class FakeScheduler: WorkoutScheduling {
  var supportsScheduling = true
  var capacity = 3
  var state = WorkoutScheduler.AuthorizationState.authorized
  var authorizationResult = WorkoutScheduler.AuthorizationState.authorized
  var entries: [ScheduledWorkoutPlan] = []
  var requests = 0
  var submissions = 0
  var removed: [UUID] = []
  var acceptsSchedule = true
  var acceptsRemoval = true
  var authorizationState: WorkoutScheduler.AuthorizationState { get async { state } }
  var scheduledWorkouts: [ScheduledWorkoutPlan] { get async { entries } }

  func requestAuthorization() async -> WorkoutScheduler.AuthorizationState {
    requests += 1
    state = authorizationResult
    return state
  }

  func schedule(_ workout: WorkoutPlan, at date: DateComponents) async {
    submissions += 1
    if acceptsSchedule { entries.append(ScheduledWorkoutPlan(workout, date: date)) }
  }

  func remove(_ workout: WorkoutPlan, at date: DateComponents) async {
    removed.append(workout.id)
    if acceptsRemoval { entries.removeAll { $0.plan.id == workout.id && $0.date == date } }
  }
}

@MainActor
private func examplePlan() throws -> WorkoutPlan {
  var plan = FuelPlan(totalDistance: "1000")
  plan.stops = [FuelStop(distance: "150", reminder: "吃胶")]
  return try plan.workoutPlan()
}

@Test @MainActor func requestsPermissionAndSubmitsOnce() async throws {
  let scheduler = FakeScheduler()
  scheduler.state = .notDetermined
  let plan = try examplePlan()
  try await WorkoutSubmission.submit(plan, using: scheduler)
  #expect(scheduler.requests == 1)
  #expect(scheduler.entries.first?.plan == plan)
  try await WorkoutSubmission.submit(plan, using: scheduler)
  #expect(scheduler.submissions == 1)
}

@Test(arguments: [false, true])
@MainActor func refusesDeniedAndRestrictedPermissions(_ restricted: Bool) async throws {
  let state: WorkoutScheduler.AuthorizationState = restricted ? .restricted : .denied
  let scheduler = FakeScheduler()
  scheduler.state = state
  do {
    try await WorkoutSubmission.submit(examplePlan(), using: scheduler)
    Issue.record("Submission should be refused")
  } catch {
    #expect(error as? SubmissionError == (state == .denied ? .denied : .restricted))
  }
  #expect(scheduler.requests == 0 && scheduler.submissions == 0 && scheduler.removed.isEmpty)
}

@Test @MainActor func handlesRefusalInAuthorizationPrompt() async throws {
  let scheduler = FakeScheduler()
  scheduler.state = .notDetermined
  scheduler.authorizationResult = .denied
  await #expect(throws: SubmissionError.denied) {
    try await WorkoutSubmission.submit(examplePlan(), using: scheduler)
  }
  #expect(scheduler.submissions == 0)
}

@Test @MainActor func unsupportedDeviceDoesNotRequestPermission() async throws {
  let scheduler = FakeScheduler()
  scheduler.supportsScheduling = false
  await #expect(throws: SubmissionError.unsupported) {
    try await WorkoutSubmission.submit(examplePlan(), using: scheduler)
  }
  #expect(scheduler.requests == 0 && scheduler.submissions == 0)
}

@Test @MainActor func fullSchedulePreservesUnrelatedPlans() async throws {
  let scheduler = FakeScheduler()
  scheduler.capacity = 1
  let other = try examplePlan()
  scheduler.entries = [
    ScheduledWorkoutPlan(other, date: DateComponents(year: 2026, month: 11, day: 5))
  ]
  await #expect(throws: SubmissionError.full) {
    try await WorkoutSubmission.submit(examplePlan(), using: scheduler)
  }
  #expect(scheduler.entries.count == 1 && scheduler.entries[0].plan == other)
  #expect(scheduler.removed.isEmpty && scheduler.submissions == 0)
}

@Test @MainActor func replacingAtCapacityOnlyRemovesOwnedPlan() async throws {
  let scheduler = FakeScheduler()
  scheduler.capacity = 2
  let old = try examplePlan()
  let other = try examplePlan()
  let date = DateComponents(year: 2026, month: 11, day: 4)
  scheduler.entries = [
    ScheduledWorkoutPlan(old, date: date), ScheduledWorkoutPlan(other, date: date),
  ]
  var updated = FuelPlan(totalDistance: "1000")
  updated.id = old.id
  updated.stops = [FuelStop(distance: "750", reminder: "喝水")]
  let new = try updated.workoutPlan()
  try await WorkoutSubmission.submit(new, using: scheduler, day: PlanDay(date))
  #expect(scheduler.removed == [old.id])
  #expect(scheduler.entries.count == 2)
  #expect(scheduler.entries.contains { $0.plan == other })
  #expect(scheduler.entries.contains { $0.plan == new })
}

@Test @MainActor func detectsScheduleNotRetainedLocally() async throws {
  let scheduler = FakeScheduler()
  scheduler.acceptsSchedule = false
  await #expect(throws: SubmissionError.notConfirmed) {
    try await WorkoutSubmission.submit(examplePlan(), using: scheduler)
  }
}

@Test @MainActor func scheduleUsesLocalCalendarDay() async throws {
  let scheduler = FakeScheduler()
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(secondsFromGMT: 8 * 3600)!
  // 2026-11-04 17:00 UTC is already November 5 in Shanghai.
  let now = ISO8601DateFormatter().date(from: "2026-11-04T17:00:00Z")!
  try await WorkoutSubmission.submit(examplePlan(), using: scheduler, now: now, calendar: calendar)
  let scheduledDate = scheduler.entries[0].date
  #expect(scheduledDate.year == 2026 && scheduledDate.month == 11 && scheduledDate.day == 5)
}

@Test @MainActor func fullScheduleDoesNotReplaceSamePlanOnAnotherDay() async throws {
  let scheduler = FakeScheduler()
  scheduler.capacity = 1
  let plan = try examplePlan()
  let previous = DateComponents(year: 2026, month: 11, day: 5)
  scheduler.entries = [ScheduledWorkoutPlan(plan, date: previous)]
  await #expect(throws: SubmissionError.full) {
    try await WorkoutSubmission.submit(
      plan, using: scheduler, day: PlanDay(DateComponents(year: 2026, month: 11, day: 6)))
  }
  #expect(scheduler.removed.isEmpty && scheduler.entries.count == 1)
  #expect(PlanDay(scheduler.entries[0].date) == PlanDay(previous))
}
