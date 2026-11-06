import Foundation
import HealthKit
import WorkoutKit

extension FuelPlan {
  func workoutPlan(locale: Locale = .current) throws -> WorkoutPlan {
    let points = try points(locale: locale)
    let total = PlanDistance.roundedMeters(Self.meters(totalDistance, locale: locale)!)
    func reminderName(_ point: FuelPoint) -> String {
      "\(PlanDistance.label(point.cumulativeMeters, locale: locale, compact: true)) \(point.reminder)"
    }
    var name = "骑行"
    if let first = points.first, first.cumulativeMeters == 0 { name = reminderName(first) }
    var previousMeters = 0.0
    // A departure reminder is the initial step's name, never a zero-distance goal.
    var steps = points.filter { $0.cumulativeMeters > 0 }.map { point in
      let distance = point.cumulativeMeters - previousMeters
      let step = IntervalStep(
        .work,
        step: WorkoutStep(
          goal: .distance(distance, .meters), displayName: name
        ))
      name = reminderName(point)
      previousMeters = point.cumulativeMeters
      return step
    }
    if total > previousMeters {
      steps.append(
        IntervalStep(
          .work,
          step: WorkoutStep(goal: .distance(total - previousMeters, .meters), displayName: name)))
      name = "\(PlanDistance.label(total, locale: locale, compact: true)) 计划完成，继续骑行"
    } else {
      name += " · 计划完成，继续骑行"
    }
    steps.append(IntervalStep(.work, step: WorkoutStep(goal: .open, displayName: name)))
    let workout = CustomWorkout(
      activity: .cycling, location: .outdoor, displayName: "Kairos 骑行补给",
      blocks: [IntervalBlock(steps: steps, iterations: 1)]
    )
    return WorkoutPlan(.custom(workout), id: id)
  }
}
