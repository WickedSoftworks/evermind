import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BookOpen, CheckCircle2, Clock, AlertTriangle } from "lucide-react"
import type { Assignment } from "@/lib/types"
import { isPast } from "date-fns"

interface StatsCardsProps {
  assignments: Assignment[]
}

export function StatsCards({ assignments }: StatsCardsProps) {
  const total = assignments.length
  const completed = assignments.filter((a) => a.status === "completed").length
  const pending = assignments.filter((a) => a.status === "pending" && !isPast(new Date(a.due_date))).length
  const overdue = assignments.filter((a) => a.status !== "completed" && isPast(new Date(a.due_date))).length

  const stats = [
    {
      title: "Total",
      value: total,
      icon: BookOpen,
      color: "text-primary",
    },
    {
      title: "Pending",
      value: pending,
      icon: Clock,
      color: "text-blue-600",
    },
    {
      title: "Completed",
      value: completed,
      icon: CheckCircle2,
      color: "text-emerald-600",
    },
    {
      title: "Overdue",
      value: overdue,
      icon: AlertTriangle,
      color: "text-rose-600",
    },
  ]

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
