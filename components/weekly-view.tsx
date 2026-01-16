"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Assignment } from "@/lib/types"
import { format, startOfWeek, addDays, isSameDay, isToday } from "date-fns"

interface WeeklyViewProps {
  assignments: Assignment[]
}

export function WeeklyView({ assignments }: WeeklyViewProps) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const getAssignmentsForDay = (date: Date) => {
    return assignments.filter((a) => a.status !== "completed" && isSameDay(new Date(a.due_date), date))
  }

  const priorityColors = {
    low: "bg-emerald-500",
    medium: "bg-amber-500",
    high: "bg-rose-500",
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">This Week</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const dayAssignments = getAssignmentsForDay(day)
            const today = isToday(day)
            return (
              <div
                key={day.toISOString()}
                className={`flex flex-col rounded-lg border p-2 min-h-[100px] ${
                  today ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="text-center mb-2">
                  <p className="text-xs text-muted-foreground">{format(day, "EEE")}</p>
                  <p className={`text-sm font-semibold ${today ? "text-primary" : ""}`}>{format(day, "d")}</p>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  {dayAssignments.slice(0, 2).map((assignment) => (
                    <div key={assignment.id} className="flex items-center gap-1">
                      <div
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityColors[assignment.priority]}`}
                      />
                      <span className="text-xs truncate flex-1">{assignment.title}</span>
                    </div>
                  ))}
                  {dayAssignments.length > 2 && (
                    <Badge variant="secondary" className="text-xs w-fit px-1 py-0">
                      +{dayAssignments.length - 2}
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
