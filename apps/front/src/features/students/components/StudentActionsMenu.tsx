import { useNavigate } from "react-router";
import { Eye, Pencil } from "lucide-react";
import { DropdownMenu } from "../../../components/ui";

export interface StudentActionsMenuProps {
  studentId: string;
}

export function StudentActionsMenu({ studentId }: StudentActionsMenuProps) {
  const navigate = useNavigate();

  return (
    <DropdownMenu
      items={[
        {
          icon: <Eye size={16} />,
          label: "مشاهده",
          onSelect: () => navigate(`/students/${studentId}`)
        },
        {
          icon: <Pencil size={16} />,
          label: "ویرایش",
          onSelect: () => navigate(`/students/${studentId}/edit`)
        }
      ]}
      label="عملیات"
    />
  );
}
