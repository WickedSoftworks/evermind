"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useTimeZone } from "@/components/timezone-provider"
import type { Assignment } from "@/lib/types"
import {
  addCalendarDays,
  formatDayKey,
  parseDueDate,
  startOfWeekKey,
  zonedDayKey,
} from "@/lib/dates"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface WeeklyViewProps {
  assignments: Assignment[]
}

export function WeeklyView({ assignments }: WeeklyViewProps) {
  const [weekOffset, setWeekOffset] = useState(0)
  const timeZone = useTimeZone()

  // Calendar-day keys rather than Date objects: which day an assignment lands on
  // depends on the visitor's timezone, and week boundaries must not be nudged by
  // a DST transition falling inside the week.
  const todayKey = zonedDayKey(new Date(), timeZone)
  const weekStartKey = addCalendarDays(startOfWeekKey(todayKey), weekOffset * 7)
  const weekEndKey = addCalendarDays(weekStartKey, 6)
  const weekDayKeys = Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStartKey, i))

  const getAssignmentsForDay = (dayKey: string) => {
    return assignments.filter(
      (a) => a.status !== "completed" && zonedDayKey(parseDueDate(a.due_date), timeZone) === dayKey,
    )
  }

  const priorityColors = {
    low: "bg-emerald-500",
    medium: "bg-amber-500",
    high: "bg-rose-500",
  }

  const getWeekLabel = () => {
    if (weekOffset === 0) return "This Week"
    if (weekOffset === 1) return "Next Week"
    if (weekOffset === -1) return "Last Week"
    const dayAndMonth: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
    return `${formatDayKey(weekStartKey, dayAndMonth)} - ${formatDayKey(weekEndKey, dayAndMonth)}`
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{getWeekLabel()}</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setWeekOffset(weekOffset - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setWeekOffset(0)}
              disabled={weekOffset === 0}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setWeekOffset(weekOffset + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {weekDayKeys.map((dayKey) => {
            const dayAssignments = getAssignmentsForDay(dayKey)
            const today = dayKey === todayKey
            return (
              <div
                key={dayKey}
                className={`flex flex-col rounded-lg border p-2 min-h-[100px] ${
                  today ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="text-center mb-2">
                  <p className="text-xs text-muted-foreground">{formatDayKey(dayKey, { weekday: "short" })}</p>
                  <p className={`text-sm font-semibold ${today ? "text-primary" : ""}`}>
                    {formatDayKey(dayKey, { day: "numeric" })}
                  </p>
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
