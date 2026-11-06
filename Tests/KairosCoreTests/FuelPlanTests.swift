import Foundation
import Testing
import WorkoutKit

@testable import KairosCore

private let english = Locale(identifier: "en_US_POSIX")

@Test func departureReminderIsAllowedAndStartsWorkoutWithoutZeroDistanceGoal() throws {
  let departure = FuelStop(distance: "0", reminder: "出发前喝水", kind: .water)
  let plan = FuelPlan(
    totalDistance: "77000",
    stops: [
      FuelStop(distance: "25000", reminder: "吃胶", kind: .gel), departure,
    ])
  try plan.validateStop(departure, locale: english)
  #expect(plan.orderedStops.first == departure)
  #expect(try plan.points(locale: english).map(\.cumulativeMeters) == [0, 25000])
  #expect(throws: PlanError.duplicateDistance) {
    try plan.validateStop(FuelStop(distance: "0.0", reminder: "重复"), locale: english)
  }
  guard case .custom(let workout) = try plan.workoutPlan(locale: english).workout else {
    Issue.record("Expected a custom workout")
    return
  }
  #expect(
    workout.blocks[0].steps.map(\.step.displayName) == [
      "0.0m 出发前喝水", "25.0km 吃胶", "77.0km 计划完成，继续骑行",
    ])
  #expect(
    workout.blocks[0].steps.map(\.step.goal) == [
      .distance(25000, .meters), .distance(52000, .meters), .open,
    ])
  let restored = try JSONDecoder().decode(FuelPlan.self, from: JSONEncoder().encode(plan))
  #expect(restored == plan)
}

@Test func departureOnlyPlanStaysOpenAndStillRequiresPositiveRideDistance() throws {
  var plan = FuelPlan(totalDistance: "77000", stops: [FuelStop(distance: "0", reminder: "巧克力")])
  guard case .custom(let workout) = try plan.workoutPlan(locale: english).workout else {
    Issue.record("Expected a custom workout")
    return
  }
  #expect(workout.blocks[0].steps.count == 2)
  #expect(workout.blocks[0].steps[0].step.displayName == "0.0m 巧克力")
  #expect(workout.blocks[0].steps[0].step.goal == .distance(77000, .meters))
  #expect(workout.blocks[0].steps[1].step.goal == .open)
  plan.totalDistance = "0"
  #expect(throws: PlanError.invalidTotalDistance) { try plan.points(locale: english) }
}

@Test func inlineDraftValidatesWithoutMovingOrRoundingExistingStops() throws {
  let existing = FuelStop(distance: "15925.9", reminder: "水", kind: .water)
  let plan = FuelPlan(totalDistance: "85000", stops: [existing])
  let draft = FuelStop(distance: "42500.123", reminder: "胶", kind: .gel)
  try plan.validateStop(draft, locale: english)
  #expect(plan.stops == [existing])
  #expect(FuelPlan.meters(draft.distance) == 42500.123)
  #expect(throws: PlanError.duplicateDistance) {
    try plan.validateStop(FuelStop(distance: "15925.9", reminder: "重复"), locale: english)
  }
  #expect(throws: PlanError.beyondPlan(1)) {
    try plan.validateStop(FuelStop(distance: "85100", reminder: "越界"), locale: english)
  }
  var editing = existing
  editing.reminder = "喝两口水"
  try plan.validateStop(editing, locale: english)
  #expect(try plan.points(locale: english).first?.kind == .water)
}

@Test func deletingMiddleReminderKeepsLaterPosition() throws {
  var plan = FuelPlan(
    totalDistance: "100000",
    stops: [
      FuelStop(distance: "25000", reminder: "胶"),
      FuelStop(distance: "45000", reminder: "水"),
      FuelStop(distance: "70000", reminder: "胶"),
    ])
  let last = plan.stops[2]
  plan.stops.remove(at: 1)
  #expect(plan.stops[1] == last)
  #expect(try plan.points(locale: english).map(\.cumulativeMeters) == [25000, 70000])
  guard case .custom(let workout) = try plan.workoutPlan(locale: english).workout else {
    Issue.record("Expected a custom workout")
    return
  }
  #expect(
    workout.blocks[0].steps.map(\.step.goal) == [
      .distance(25000, .meters), .distance(45000, .meters), .distance(30000, .meters), .open,
    ])
  plan.stops.insert(FuelStop(distance: "45000", reminder: "水"), at: 1)
  plan.stops[1].distance = "50000"
  plan.totalDistance = "120000"
  #expect(plan.stops[2] == last)
  #expect(try plan.points(locale: english).last?.cumulativeMeters == 70000)
}

@Test func legacyPlanMigratesIntervalsOnceAndRequiresRideDistance() throws {
  let id = UUID()
  let firstID = UUID()
  let secondID = UUID()
  let json = """
    {"id":"\(id)","segments":[
      {"id":"\(firstID)","distance":"25000","reminder":"Water"},
      {"id":"\(secondID)","distance":"20000","reminder":"喝可乐","kind":"custom","name":"可乐"}
    ]}
    """
  var plan = try JSONDecoder().decode(FuelPlan.self, from: Data(json.utf8))
  #expect(plan.id == id && plan.stops.map(\.id) == [firstID, secondID])
  #expect(plan.stops.map(\.distance) == ["25000", "45000"])
  #expect(plan.stops[0].kind == .custom && plan.stops[0].name == "补给")
  #expect(plan.stops[1].kind == .custom && plan.stops[1].name == "可乐")
  #expect(plan.stops.map(\.reminder) == ["Water", "喝可乐"])
  #expect(plan.totalDistance.isEmpty)
  #expect(throws: PlanError.invalidTotalDistance) { try plan.points(locale: english) }
  let restoredDraft = try JSONDecoder().decode(FuelPlan.self, from: JSONEncoder().encode(plan))
  #expect(restoredDraft == plan)
  plan.totalDistance = "80000"
  let restored = try JSONDecoder().decode(FuelPlan.self, from: JSONEncoder().encode(plan))
  #expect(restored == plan)
  #expect(try restored.points(locale: english).map(\.cumulativeMeters) == [25000, 45000])
}

@Test func invalidLegacyIntervalsKeepOriginalDraftForManualCorrection() throws {
  let json = """
    {"id":"\(UUID())","segments":[
      {"id":"\(UUID())","distance":"50","reminder":"一"},
      {"id":"\(UUID())","distance":"bad","reminder":"二"},
      {"id":"\(UUID())","distance":"100","reminder":"三"}
    ]}
    """
  let plan = try JSONDecoder().decode(FuelPlan.self, from: Data(json.utf8))
  #expect(plan.stops.map(\.distance) == ["50", "", ""])
  #expect(plan.stops.map(\.legacyDistance) == [nil, "bad", "100"])
  #expect(plan.stops.map(\.reminder) == ["一", "二", "三"])
  #expect(try JSONDecoder().decode(FuelPlan.self, from: JSONEncoder().encode(plan)) == plan)
}

@Test func customFuelRoundTripsWithoutChangingWorkoutReminder() throws {
  let plan = FuelPlan(
    totalDistance: "80000",
    stops: [
      FuelStop(distance: "25000", reminder: "吃半根香蕉", kind: .custom, name: "香蕉")
    ])
  let restored = try JSONDecoder().decode(FuelPlan.self, from: JSONEncoder().encode(plan))
  #expect(restored == plan)
  #expect(restored.stops[0].displayName == "香蕉")
  guard case .custom(let workout) = try restored.workoutPlan(locale: english).workout else {
    Issue.record("Expected a custom workout")
    return
  }
  #expect(workout.blocks[0].steps[1].step.displayName == "25.0km 吃半根香蕉")
  #expect(workout.blocks[0].steps[1].step.goal == .distance(55000, .meters))
}

@Test func requiresCustomNameWithoutRestrictingOtherReminders() throws {
  let custom = FuelPlan(
    totalDistance: "100",
    stops: [
      FuelStop(distance: "50", reminder: "盐丸", kind: .custom, name: " \n ")
    ])
  #expect(throws: PlanError.emptyName(1)) { try custom.points(locale: english) }
  for kind in [FuelKind.water, .gel] {
    let plan = FuelPlan(
      totalDistance: "100",
      stops: [
        FuelStop(distance: "50", reminder: "任意文案", kind: kind)
      ])
    #expect(try plan.points(locale: english).count == 1)
  }
}

@Test func legacyOtherBecomesCustomWithoutChangingPlanOrReminder() throws {
  let planID = UUID()
  let stopID = UUID()
  for name in ["", "盐丸"] {
    let json = """
      {"id":"\(planID)","totalDistance":"80000","stops":[
        {"id":"\(stopID)","distance":"41759.3","reminder":"补充电解质","kind":"other","name":"\(name)"}
      ]}
      """
    let plan = try JSONDecoder().decode(FuelPlan.self, from: Data(json.utf8))
    #expect(plan.id == planID && plan.stops[0].id == stopID)
    #expect(plan.stops[0].kind == .custom)
    #expect(plan.stops[0].name == (name.isEmpty ? "补给" : name))
    #expect(plan.stops[0].distance == "41759.3")
    #expect(try plan.points(locale: english)[0].reminder == "补充电解质")
    #expect(try JSONDecoder().decode(FuelPlan.self, from: JSONEncoder().encode(plan)) == plan)
    guard case .custom(let workout) = try plan.workoutPlan(locale: english).workout else {
      Issue.record("Expected a custom workout")
      return
    }
    #expect(workout.blocks[0].steps[1].step.displayName == "41.8km 补充电解质")
  }
}

@Test(arguments: ["", " ", "-5", "NaN", "inf", "1e2", "200m", "1.2.3", "1,000"])
func rejectsInvalidDistances(_ distance: String) {
  var plan = FuelPlan(totalDistance: "1000", stops: [FuelStop(distance: distance, reminder: "喝水")])
  #expect(throws: PlanError.invalidDistance(1)) { try plan.points(locale: english) }
  plan.totalDistance = distance
  plan.stops[0].distance = "50"
  #expect(throws: PlanError.invalidTotalDistance) { try plan.points(locale: english) }
}

@Test func parsesLocaleDecimalWithoutGrouping() throws {
  let plan = FuelPlan(totalDistance: "100,5", stops: [FuelStop(distance: "12,5", reminder: "喝水")])
  #expect(try plan.points(locale: Locale(identifier: "fr_FR"))[0].cumulativeMeters == 12.5)
}

@Test func rejectsEmptyPlanAndBlankReminders() {
  var plan = FuelPlan(totalDistance: "100")
  #expect(throws: PlanError.emptyPlan) { try plan.points() }
  plan.stops = [FuelStop(distance: "12", reminder: " \n ")]
  #expect(throws: PlanError.emptyReminder(1)) { try plan.points() }
}

@Test func validatesPlanBoundsAndDuplicatePositions() throws {
  var plan = FuelPlan(totalDistance: "1000", stops: [FuelStop(distance: "1000", reminder: "水")])
  #expect(try plan.points().last?.cumulativeMeters == 1000)
  plan.totalDistance = "999"
  #expect(throws: PlanError.beyondPlan(1)) { try plan.points() }
  plan.totalDistance = "1000"
  plan.stops.append(FuelStop(distance: "1000.0", reminder: "胶"))
  #expect(throws: PlanError.duplicateDistance) { try plan.points() }
}

@Test func workoutSortsAbsolutePositionsAndConvertsOnlyAtExport() throws {
  let plan = FuelPlan(
    totalDistance: "100000",
    stops: [
      FuelStop(distance: "70000", reminder: "水"),
      FuelStop(distance: "25000", reminder: "  胶  "),
      FuelStop(distance: "45000", reminder: "盐丸"),
    ])
  #expect(try plan.points(locale: english).map(\.cumulativeMeters) == [25000, 45000, 70000])
  #expect(plan.orderedStops.map(\.distance) == ["25000", "45000", "70000"])
  let workoutPlan = try plan.workoutPlan(locale: english)
  #expect(workoutPlan.id == plan.id)
  guard case .custom(let workout) = workoutPlan.workout else {
    Issue.record("Expected a custom workout")
    return
  }
  #expect(workout.activity == .cycling && workout.location == .outdoor)
  #expect(workout.warmup == nil && workout.cooldown == nil)
  #expect(workout.blocks.count == 1 && workout.blocks[0].iterations == 1)
  let steps = workout.blocks[0].steps
  #expect(
    steps.map(\.step.displayName) == [
      "骑行", "25.0km 胶", "45.0km 盐丸", "70.0km 水", "100.0km 计划完成，继续骑行",
    ])
  #expect(
    steps.map(\.step.goal) == [
      .distance(25000, .meters), .distance(20000, .meters), .distance(25000, .meters),
      .distance(30000, .meters), .open,
    ])
  #expect(steps.allSatisfy { $0.step.alert == nil })
  #expect(try WorkoutPlan(from: workoutPlan.dataRepresentation) == workoutPlan)
}

@Test func singleStopAtRideEndStillHasItsFinalReminder() throws {
  let plan = FuelPlan(totalDistance: "50", stops: [FuelStop(distance: "50", reminder: "吃胶")])
  guard case .custom(let workout) = try plan.workoutPlan().workout else {
    Issue.record("Expected a custom workout")
    return
  }
  #expect(workout.blocks[0].steps.count == 2)
  #expect(workout.blocks[0].steps[1].step.goal == .open)
  #expect(workout.blocks[0].steps[1].step.displayName == "50.0m 吃胶 · 计划完成，继续骑行")
}

@Test func screenshotDistancesMatchStoredPositionsAndIncludeRideEnd() throws {
  let plan = FuelPlan(
    totalDistance: "75000",
    stops: [
      FuelStop(distance: "14542", reminder: "喝水", kind: .water),
      FuelStop(distance: "31617", reminder: "吃胶", kind: .gel),
      FuelStop(distance: "51061", reminder: "吃胶", kind: .gel),
    ])
  let normalized = try plan.normalized(locale: english)
  #expect(normalized.stops.map(\.distance) == ["14500", "31600", "51100"])
  #expect(normalized.id == plan.id && normalized.stops.map(\.id) == plan.stops.map(\.id))
  #expect(plan.stops[0].distance == "14542")
  guard case .custom(let workout) = try plan.workoutPlan(locale: english).workout else {
    Issue.record("Expected custom workout")
    return
  }
  #expect(
    workout.blocks[0].steps.map(\.step.goal) == [
      .distance(14500, .meters), .distance(17100, .meters), .distance(19500, .meters),
      .distance(23900, .meters), .open,
    ])
  #expect(
    workout.blocks[0].steps.map(\.step.displayName) == [
      "骑行", "14.5km 喝水", "31.6km 吃胶", "51.1km 吃胶", "75.0km 计划完成，继续骑行",
    ])
  #expect(PlanDistance.label(14542, locale: english) == "14.5 km")
  #expect(PlanDistance.roundedMeters(999.96) == 1000)
  #expect(PlanDistance.stored(123.456) == "123.5")
  #expect(throws: PlanError.invalidTotalDistance) {
    try FuelPlan(totalDistance: "0.04", stops: [FuelStop(distance: "0", reminder: "喝水")]).points()
  }
  #expect(
    try WorkoutPlan(from: plan.workoutPlan(locale: english).dataRepresentation)
      == normalized.workoutPlan(locale: english))
}

@Test func roundedDuplicateStopsRequireExplicitMerge() {
  let plan = FuelPlan(
    totalDistance: "30000",
    stops: [
      FuelStop(distance: "25010", reminder: "水"), FuelStop(distance: "25040", reminder: "胶"),
    ])
  #expect(throws: PlanError.duplicateDistance) { try plan.points(locale: english) }
}
