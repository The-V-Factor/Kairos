import Foundation
import WorkoutKit

struct PlanDay: Codable, Hashable, Comparable, Identifiable {
  let year: Int
  let month: Int
  let day: Int

  init(_ date: Date, calendar: Calendar = .current) {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    year = parts.year!
    month = parts.month!
    day = parts.day!
  }

  init?(_ parts: DateComponents) {
    guard let year = parts.year, let month = parts.month, let day = parts.day else { return nil }
    self.year = year
    self.month = month
    self.day = day
  }

  var id: String { "\(year)-\(month)-\(day)" }
  var components: DateComponents { DateComponents(year: year, month: month, day: day) }
  var date: Date? { Calendar.current.date(from: components) }

  static func < (lhs: Self, rhs: Self) -> Bool {
    (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
  }
}

struct PlanHistoryEntry: Codable, Equatable, Identifiable {
  let workoutID: UUID
  let day: PlanDay
  var fuelPlan: FuelPlan?
  var workoutData: Data
  let savedAt: Date
  var wasComplete = false
  var removedAt: Date?

  var id: String { "\(workoutID.uuidString)/\(day.id)" }
  var workout: WorkoutPlan? { try? WorkoutPlan(from: workoutData) }

  init(workout: WorkoutPlan, day: PlanDay, fuelPlan: FuelPlan? = nil, now: Date = .now) throws {
    workoutID = workout.id
    self.day = day
    self.fuelPlan = fuelPlan
    workoutData = try workout.dataRepresentation
    savedAt = now
  }
}

enum PlanHistoryError: LocalizedError {
  case unreadable, removalNotConfirmed

  var errorDescription: String? {
    switch self {
    case .unreadable: "历史存档无法读取，已保留原文件。请先处理存档问题，再发送新计划。"
    case .removalNotConfirmed: "系统排程中仍有这份计划，暂未确认撤回成功，请刷新后重试。"
    }
  }
}
