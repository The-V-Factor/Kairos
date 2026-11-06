import Foundation
import Testing
import WorkoutKit

@testable import KairosCore

private let english = Locale(identifier: "en_US_POSIX")

@Test func manualDistancesBecomeCumulativePoints() throws {
  var plan = FuelPlan()
  plan.segments = [
    FuelSegment(distance: "125.5", reminder: "  吃第一包胶  "),
    FuelSegment(distance: "300", reminder: "喝水"),
    FuelSegment(distance: "74.5", reminder: "吃第二包胶"),
  ]
  let points = try plan.points(locale: english)
  #expect(points.map(\.cumulativeMeters) == [125.5, 425.5, 500])
  #expect(points.map(\.distanceMeters) == [125.5, 300, 74.5])
  #expect(points.map(\.reminder) == ["吃第一包胶", "喝水", "吃第二包胶"])
}

@Test(arguments: ["", " ", "0", "-5", "NaN", "inf", "1e2", "200m", "1.2.3", "1,000"])
func rejectsInvalidDistances(_ distance: String) {
  var plan = FuelPlan()
  plan.segments = [FuelSegment(distance: distance, reminder: "喝水")]
  #expect(throws: PlanError.invalidDistance(1)) { try plan.points(locale: english) }
}

@Test func parsesLocaleDecimalWithoutGrouping() throws {
  var plan = FuelPlan()
  plan.segments = [FuelSegment(distance: "12,5", reminder: "喝水")]
  #expect(try plan.points(locale: Locale(identifier: "fr_FR"))[0].distanceMeters == 12.5)
}

@Test func rejectsEmptyPlanAndBlankReminders() {
  var plan = FuelPlan()
  plan.segments = []
  #expect(throws: PlanError.emptyPlan) { try plan.points() }
  plan.segments = [FuelSegment(distance: "12", reminder: " \n ")]
  #expect(throws: PlanError.emptyReminder(1)) { try plan.points() }
}

@Test func rejectsCumulativeOverflow() {
  let large = "9" + String(repeating: "0", count: 307)
  var plan = FuelPlan()
  plan.segments = [
    FuelSegment(distance: large, reminder: "一"), FuelSegment(distance: large, reminder: "二"),
  ]
  #expect(throws: PlanError.distanceOverflow) { try plan.points(locale: english) }
}

@Test func workoutCarriesReminderInFollowingStepAndStaysOpen() throws {
  var plan = FuelPlan()
  plan.segments = [
    FuelSegment(distance: "125.5", reminder: "胶"), FuelSegment(distance: "300", reminder: "水"),
  ]
  let workoutPlan = try plan.workoutPlan(locale: english)
  #expect(workoutPlan.id == plan.id)
  guard case .custom(let workout) = workoutPlan.workout else {
    Issue.record("Expected a custom workout")
    return
  }
  #expect(workout.activity == .cycling)
  #expect(workout.location == .outdoor)
  #expect(workout.warmup == nil && workout.cooldown == nil)
  #expect(workout.blocks.count == 1 && workout.blocks[0].iterations == 1)
  let steps = workout.blocks[0].steps
  #expect(steps.map(\.step.displayName) == ["开始骑行", "胶", "水"])
  #expect(steps.map(\.step.goal) == [.distance(125.5, .meters), .distance(300, .meters), .open])
  #expect(steps.allSatisfy { $0.step.alert == nil })
  let decoded = try WorkoutPlan(from: workoutPlan.dataRepresentation)
  #expect(decoded == workoutPlan)
}

@Test func singleSegmentStillHasItsFinalReminder() throws {
  var plan = FuelPlan()
  plan.segments = [FuelSegment(distance: "50", reminder: "吃胶")]
  guard case .custom(let workout) = try plan.workoutPlan().workout else {
    Issue.record("Expected a custom workout")
    return
  }
  #expect(workout.blocks[0].steps.count == 2)
  #expect(workout.blocks[0].steps[1].step.goal == .open)
  #expect(workout.blocks[0].steps[1].step.displayName == "吃胶")
}
