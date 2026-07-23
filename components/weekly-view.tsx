"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMounted } from "@/hooks/use-mounted"
import type { Assignment } from "@/lib/types"
import { format, startOfWeek, addDays, addWeeks, isSameDay, isToday } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface WeeklyViewProps {
  assignments: Assignment[]
}

export function WeeklyView({ assignments }: WeeklyViewProps) {
  const [weekOffset, setWeekOffset] = useState(0)
  const mounted = useMounted()

  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekStart = addWeeks(currentWeekStart, weekOffset)
  const weekEnd = addDays(weekStart, 6)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const getAssignmentsForDay = (date: Date) => {
    return assignments.filter((a) => a.status !== "completed" && isSameDay(new Date(a.due_date), date))
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
    return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d")}`
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
          {/* Which days make up "this week" depends on the visitor's timezone,
              so the grid can only be filled in after hydration. */}
          {!mounted
            ? [...Array(7)].map((_, i) => <Skeleton key={i} className="min-h-[100px] rounded-lg" />)
            : weekDays.map((day) => {
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
