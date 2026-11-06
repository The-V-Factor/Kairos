import Foundation
import Observation
import WorkoutKit

@MainActor @Observable
final class PlanStore {
  static let storageKey = "kairos.fuelPlan.v1"
  static let historyKey = "kairos.planHistory.v1"
  static let dateKey = "kairos.rideDate.v1"

  var rideDate: Date {
    didSet {
      defaults.set(PlanDay(rideDate).id, forKey: Self.dateKey)
      submissionMessage = nil
    }
  }
  private(set) var history: [PlanHistoryEntry] = []
  private(set) var scheduled: [ScheduledWorkoutPlan] = []
  private(set) var scheduleCheckedAt: Date?
  private(set) var historyMessage: String?
  private(set) var isRefreshing = false
  private(set) var removingHistoryID: String?
  @ObservationIgnored private var historyIsReadable = true

  var isWorking: Bool { isSending || isRefreshing || removingHistoryID != nil }

  var plan: FuelPlan {
    didSet {
      submissionMessage = nil
      do {
        defaults.set(try JSONEncoder().encode(plan), forKey: Self.storageKey)
        storageMessage = nil
      } catch {
        storageMessage = "计划未能保存在本机：\(error.localizedDescription)"
      }
    }
  }
  private(set) var storageMessage: String?
  private(set) var submissionMessage: String?
  private(set) var isSending = false
  @ObservationIgnored private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    rideDate = .now
    if let day = defaults.string(forKey: Self.dateKey) {
      let parts = day.split(separator: "-").compactMap { Int($0) }
      if parts.count == 3,
        let date = Calendar.current.date(
          from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
      {
        rideDate = date
      }
    }
    if let data = defaults.data(forKey: Self.storageKey) {
      do {
        plan = try JSONDecoder().decode(FuelPlan.self, from: data)
      } catch {
        plan = FuelPlan()
        storageMessage = "保存的计划无法读取。当前显示空白计划，编辑后将替换旧数据。"
      }
    } else {
      plan = FuelPlan()
    }
    if let data = defaults.data(forKey: Self.historyKey) {
      do { history = try JSONDecoder().decode([PlanHistoryEntry].self, from: data) } catch {
        historyIsReadable = false
        historyMessage = PlanHistoryError.unreadable.localizedDescription
      }
    }
  }

  var validationMessage: String? {
    do {
      _ = try plan.points()
      return nil
    } catch {
      return error.localizedDescription
    }
  }

  func send() async {
    await send(using: WorkoutScheduler.shared)
  }

  func send(using scheduler: some WorkoutScheduling, now: Date = .now) async {
    guard !isWorking else { return }
    isSending = true
    submissionMessage = nil
    defer { isSending = false }
    do {
      guard historyIsReadable else { throw PlanHistoryError.unreadable }
      var snapshot = try plan.normalized()
      let day = PlanDay(rideDate)
      let existing = try await WorkoutSubmission.schedules(
        using: scheduler, requestAuthorization: true)
      if existing.contains(where: {
        $0.plan.id == snapshot.id && PlanDay($0.date) == day && $0.complete
      })
        || history.contains(where: {
          $0.workoutID == snapshot.id && $0.day == day && $0.wasComplete
        })
      {
        snapshot.id = UUID()
      }
      let workout = try snapshot.workoutPlan()
      try await WorkoutSubmission.submit(workout, using: scheduler, day: day)
      let record = try PlanHistoryEntry(workout: workout, day: day, fuelPlan: snapshot, now: now)
      var records = history.filter { $0.id != record.id }
      records.append(record)
      try saveHistory(records)
      plan = snapshot
      try await reconcile(WorkoutSubmission.schedules(using: scheduler), now: now)
      submissionMessage = "已提交到本机训练排程。请在 Apple Watch 的“体能训练”确认 Kairos 骑行补给计划，再手动启动；这不代表手表已收到。"
    } catch {
      submissionMessage = error.localizedDescription
      scheduleCheckedAt = nil
    }
  }

  func refreshHistory(requestAuthorization: Bool = false) async {
    await refreshHistory(using: WorkoutScheduler.shared, requestAuthorization: requestAuthorization)
  }

  func refreshHistory(
    using scheduler: some WorkoutScheduling, requestAuthorization: Bool = false, now: Date = .now
  ) async {
    guard !isWorking else { return }
    isRefreshing = true
    historyMessage = nil
    defer { isRefreshing = false }
    do {
      guard historyIsReadable else { throw PlanHistoryError.unreadable }
      try await reconcile(
        WorkoutSubmission.schedules(using: scheduler, requestAuthorization: requestAuthorization),
        now: now)
    } catch {
      scheduleCheckedAt = nil
      historyMessage = error.localizedDescription
    }
  }

  func removeSchedule(_ record: PlanHistoryEntry) async {
    await removeSchedule(record, using: WorkoutScheduler.shared)
  }

  func removeSchedule(
    _ record: PlanHistoryEntry, using scheduler: some WorkoutScheduling, now: Date = .now
  ) async {
    guard !isWorking else { return }
    removingHistoryID = record.id
    historyMessage = nil
    defer { removingHistoryID = nil }
    do {
      guard historyIsReadable else { throw PlanHistoryError.unreadable }
      let current = try await WorkoutSubmission.schedules(using: scheduler)
      for entry in current
      where entry.plan.id == record.workoutID && PlanDay(entry.date) == record.day {
        await scheduler.remove(entry.plan, at: entry.date)
      }
      let updated = try await WorkoutSubmission.schedules(using: scheduler)
      guard
        !updated.contains(where: {
          $0.plan.id == record.workoutID && PlanDay($0.date) == record.day
        })
      else {
        throw PlanHistoryError.removalNotConfirmed
      }
      var records = history
      if let index = records.firstIndex(where: { $0.id == record.id }) {
        records[index].removedAt = now
      }
      try saveHistory(records)
      try reconcile(updated, now: now)
      historyMessage = "已从本机系统排程移除；手机历史保留，请在手表确认同步结果。"
    } catch {
      scheduleCheckedAt = nil
      historyMessage = error.localizedDescription
    }
  }

  func scheduledEntry(for record: PlanHistoryEntry) -> ScheduledWorkoutPlan? {
    guard scheduleCheckedAt != nil else { return nil }
    return scheduled.first { $0.plan.id == record.workoutID && PlanDay($0.date) == record.day }
  }

  func status(for record: PlanHistoryEntry) -> String {
    let latest = history.first { $0.id == record.id } ?? record
    guard scheduleCheckedAt != nil else {
      if latest.removedAt != nil { return "曾撤回 · 待刷新" }
      return latest.wasComplete ? "曾完成 · 待刷新" : "状态待刷新"
    }
    if let entry = scheduledEntry(for: record) { return entry.complete ? "系统回报已完成" : "系统排程中" }
    if latest.removedAt != nil { return "已撤回排程" }
    return latest.wasComplete ? "已完成（历史回报）" : "当前排程未找到"
  }

  private func reconcile(_ entries: [ScheduledWorkoutPlan], now: Date) throws {
    var records = history
    for entry in entries {
      guard let day = PlanDay(entry.date) else { continue }
      if let index = records.firstIndex(where: { $0.workoutID == entry.plan.id && $0.day == day }) {
        if records[index].workout != entry.plan { records[index].fuelPlan = nil }
        records[index].workoutData = try entry.plan.dataRepresentation
        records[index].wasComplete = entry.complete
        records[index].removedAt = nil
      } else {
        var record = try PlanHistoryEntry(workout: entry.plan, day: day, now: now)
        record.wasComplete = entry.complete
        records.append(record)
      }
    }
    try saveHistory(records)
    scheduled = entries
    scheduleCheckedAt = now
  }

  private func saveHistory(_ records: [PlanHistoryEntry]) throws {
    let data = try JSONEncoder().encode(records)
    defaults.set(data, forKey: Self.historyKey)
    history = records.sorted { $0.day == $1.day ? $0.savedAt > $1.savedAt : $0.day > $1.day }
  }
}
