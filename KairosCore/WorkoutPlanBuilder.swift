import Foundation
import HealthKit
import WorkoutKit

extension FuelPlan {
  func workoutPlan(locale: Locale = .current) throws -> WorkoutPlan {
    let points = try points(locale: locale)
    var name = "开始骑行"
    var steps = points.map { point in
      let step = IntervalStep(
        .work,
        step: WorkoutStep(
          goal: .distance(point.distanceMeters, .meters), displayName: name
        ))
      name = point.reminder
      return step
    }
    steps.append(IntervalStep(.work, step: WorkoutStep(goal: .open, displayName: name)))
    let workout = CustomWorkout(
      activity: .cycling, location: .outdoor, displayName: "Kairos 骑行补给",
      blocks: [IntervalBlock(steps: steps, iterations: 1)]
    )
    return WorkoutPlan(.custom(workout), id: id)
  }
}
