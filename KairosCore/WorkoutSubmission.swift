import Foundation
import HealthKit
// WorkoutKit's SDK authorization enum predates Swift 6 Sendable annotations.
@preconcurrency import WorkoutKit

// The small boundary lets tests exercise permission and replacement without changing a real schedule.
@MainActor
protocol WorkoutScheduling {
  var supportsScheduling: Bool { get }
  var capacity: Int { get }
  var authorizationState: WorkoutScheduler.AuthorizationState { get async }
  var scheduledWorkouts: [ScheduledWorkoutPlan] { get async }
  func requestAuthorization() async -> WorkoutScheduler.AuthorizationState
  func schedule(_ workout: WorkoutPlan, at date: DateComponents) async
  func remove(_ workout: WorkoutPlan, at date: DateComponents) async
}

extension WorkoutScheduler: WorkoutScheduling {
  var supportsScheduling: Bool { Self.isSupported }
  var capacity: Int { Self.maxAllowedScheduledWorkoutCount }
}

enum SubmissionError: LocalizedError, Equatable {
  case unsupported, denied, restricted, full, notConfirmed

  var errorDescription: String? {
    switch self {
    case .unsupported:
      "当前设备不支持此骑行计划的排程。请使用已配对 Apple Watch 的 iPhone，并确认 watchOS 11 或更新版本及系统体能训练可用。"
    case .denied:
      "未获准添加训练。请在 iPhone 的 Watch App → 体能训练中允许 Kairos，再回来重试。"
    case .restricted:
      "系统限制了训练排程权限，请检查设备限制后重试。"
    case .full:
      "训练排程已满。请先移除不需要的训练，再重试；Kairos 不会替你删除其他计划。"
    case .notConfirmed:
      "本机暂未确认本次排程，请重试并在手表体能训练中检查计划。"
    }
  }
}

@MainActor
enum WorkoutSubmission {
  static func submit(
    _ plan: WorkoutPlan,
    using scheduler: some WorkoutScheduling,
    now: Date = .now,
    calendar: Calendar = .current
  ) async throws {
    guard scheduler.supportsScheduling,
      case .custom(let custom) = plan.workout,
      CustomWorkout.supportsActivity(custom.activity),
      custom.blocks.flatMap(\.steps).allSatisfy({
        CustomWorkout.supportsGoal(
          $0.step.goal, activity: custom.activity, location: custom.location)
      })
    else { throw SubmissionError.unsupported }
    // Apple's encoder validates the composition before we replace any existing schedule.
    _ = try plan.dataRepresentation
    var authorization = await scheduler.authorizationState
    if authorization == .notDetermined {
      authorization = await scheduler.requestAuthorization()
    }
    switch authorization {
    case .authorized: break
    case .denied: throw SubmissionError.denied
    case .restricted: throw SubmissionError.restricted
    default: throw SubmissionError.notConfirmed
    }

    let date = calendar.dateComponents([.year, .month, .day], from: now)
    let existing = await scheduler.scheduledWorkouts
    let owned = existing.filter { $0.plan.id == plan.id }
    if owned.count == 1, let entry = owned.first, entry.plan == plan,
      sameDay(entry.date, date), !entry.complete
    {
      return
    }
    guard existing.count - owned.count < scheduler.capacity else { throw SubmissionError.full }
    for entry in owned {
      await scheduler.remove(entry.plan, at: entry.date)
    }
    await scheduler.schedule(plan, at: date)
    let updated = await scheduler.scheduledWorkouts
    guard updated.contains(where: { $0.plan == plan && sameDay($0.date, date) && !$0.complete })
    else {
      throw SubmissionError.notConfirmed
    }
  }

  private static func sameDay(_ lhs: DateComponents, _ rhs: DateComponents) -> Bool {
    lhs.year == rhs.year && lhs.month == rhs.month && lhs.day == rhs.day
  }
}
