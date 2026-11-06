import SwiftUI
import WorkoutKit

struct PlanHistoryView: View {
  @Bindable var store: PlanStore
  let theme: RideTheme
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase

  private var days: [PlanDay] { Array(Set(store.history.map(\.day))).sorted(by: >) }

  var body: some View {
    NavigationStack {
      List {
        Section {
          Text("按骑行日期保留发送时的计划。撤回系统排程后，历史仍在这里。")
            .font(.subheadline).foregroundStyle(theme.muted)
          if let message = store.historyMessage {
            Text(message).font(.footnote)
          }
          if let checked = store.scheduleCheckedAt {
            Text("排程更新于 \(checked.formatted(date: .omitted, time: .shortened))")
              .font(.caption).foregroundStyle(theme.muted)
          }
        } footer: {
          Text("状态来自 Kairos 的系统排程，请到手表确认是否已收到。手表通常展示前后各七天的计划；超出窗口不等于已删除。")
        }
        if store.history.isEmpty {
          ContentUnavailableView(
            "还没有历史计划", systemImage: "calendar",
            description: Text("发送计划后自动保留；刷新可找回本 App 以前排入系统的计划。"))
        }
        ForEach(days) { day in
          Section(day.date?.formatted(date: .complete, time: .omitted) ?? day.id) {
            ForEach(store.history.filter { $0.day == day }) { record in
              NavigationLink(value: record.id) {
                VStack(alignment: .leading, spacing: 7) {
                  Text(
                    record.fuelPlan.flatMap { FuelPlan.meters($0.totalDistance) }.map(rideDistance)
                      ?? "系统训练计划"
                  )
                  .font(.system(.title3, design: theme.fontDesign).weight(.semibold))
                  Text(store.status(for: record)).font(.subheadline).foregroundStyle(theme.accent)
                  if let plan = record.fuelPlan {
                    Text(plan.orderedStops.map(\.reminder).joined(separator: " · "))
                      .font(.caption).foregroundStyle(theme.muted).lineLimit(2)
                  } else {
                    Text("从系统排程找回，可查看原始分段和撤回。")
                      .font(.caption).foregroundStyle(theme.muted)
                  }
                }.padding(.vertical, 5)
              }
            }
          }
        }
      }
      .scrollContentBackground(.hidden).background(theme.canvas).foregroundStyle(theme.ink)
      .navigationTitle("历史计划").navigationBarTitleDisplayMode(.inline)
      .navigationDestination(for: String.self) { id in
        PlanHistoryDetail(store: store, recordID: id, theme: theme)
      }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("完成") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button {
            Task { await store.refreshHistory(requestAuthorization: true) }
          } label: {
            if store.isRefreshing { ProgressView() } else { Image(systemName: "arrow.clockwise") }
          }.disabled(store.isWorking).accessibilityLabel("授权并刷新系统排程")
        }
      }
      .refreshable { await store.refreshHistory() }
      .task { await store.refreshHistory() }
      .onChange(of: scenePhase) { _, phase in
        if phase == .active { Task { await store.refreshHistory() } }
      }
      .tint(theme.accent)
    }
  }
}

private struct PlanHistoryDetail: View {
  @Bindable var store: PlanStore
  let recordID: String
  let theme: RideTheme
  @State private var confirmingRemoval = false

  private var record: PlanHistoryEntry? { store.history.first { $0.id == recordID } }

  var body: some View {
    List {
      if let record {
        Section {
          Text(record.day.date?.formatted(date: .complete, time: .omitted) ?? record.day.id)
            .font(.headline)
          Text(store.status(for: record)).foregroundStyle(theme.accent)
          if let message = store.historyMessage { Text(message).font(.footnote) }
        } footer: {
          Text("系统排程状态以本次刷新为准；是否已在手表出现，仍需在手表确认。")
        }
        if let plan = record.fuelPlan, let points = try? plan.points() {
          Section("补给计划 · 距出发累计里程") {
            LabeledContent(
              "计划距离", value: FuelPlan.meters(plan.totalDistance).map(rideDistance) ?? "—")
            ForEach(points) { point in
              HStack {
                Text(rideDistance(point.cumulativeMeters)).monospacedDigit()
                Spacer()
                Text(point.reminder)
              }
            }
          }
        }
        if case .custom(let workout) = record.workout?.workout {
          Section {
            ForEach(Array(workout.blocks.flatMap(\.steps).enumerated()), id: \.offset) {
              _, interval in
              VStack(alignment: .leading, spacing: 5) {
                Text(interval.step.displayName ?? "骑行")
                Text(goalDescription(interval.step.goal)).font(.caption).foregroundStyle(
                  theme.muted)
              }.padding(.vertical, 3)
            }
          } header: {
            Text("系统训练分段")
          } footer: {
            Text("分段名称在该段开始时呈现，下面是这一段的距离，不是距出发累计里程。")
          }
        }
        if store.scheduledEntry(for: record) != nil {
          Section {
            Button(role: .destructive) {
              confirmingRemoval = true
            } label: {
              if store.removingHistoryID == record.id {
                HStack {
                  ProgressView()
                  Text("正在撤回…")
                }
              } else {
                Text("撤回系统排程")
              }
            }.disabled(store.isWorking)
          } footer: {
            Text("仅撤回这份计划在此日期的排程；手机历史与已完成的骑行记录保留。")
          }
        }
      }
    }
    .scrollContentBackground(.hidden).background(theme.canvas).foregroundStyle(theme.ink)
    .navigationTitle("计划详情").navigationBarTitleDisplayMode(.inline)
    .confirmationDialog("撤回这一天的系统排程？", isPresented: $confirmingRemoval, titleVisibility: .visible) {
      Button("撤回排程", role: .destructive) {
        if let record { Task { await store.removeSchedule(record) } }
      }
    } message: {
      Text("历史计划和骑行记录会保留。操作后请到手表确认同步结果。")
    }
  }

  private func goalDescription(_ goal: WorkoutGoal) -> String {
    switch goal {
    case .distance(let value, let unit):
      let meters = Measurement(value: value, unit: unit).converted(to: .meters).value
      return "本段骑行 \(meters.formatted(.number.precision(.fractionLength(0...1)))) 米"
    case .open:
      return "开放骑行，由你手动结束记录"
    default:
      return "系统训练目标"
    }
  }
}
