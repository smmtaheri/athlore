import { StatusBadge } from "../../../components/ui";
import type { StudentStatus } from "../types/student";
import { statusLabels } from "../types/options";

export interface StudentStatusBadgeProps {
  status: StudentStatus;
}

export function StudentStatusBadge({ status }: StudentStatusBadgeProps) {
  return (
    <StatusBadge variant={status === "active" ? "success" : "neutral"}>
      {statusLabels[status]}
    </StatusBadge>
  );
}
