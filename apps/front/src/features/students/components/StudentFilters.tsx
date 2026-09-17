import { RotateCcw } from "lucide-react";
import { Button, Card, FormField, Input, Select } from "../../../components/ui";
import type {
  PrimaryGoal,
  StudentsListFilters,
  StudentStatus,
  TrainingLevel
} from "../types/student";
import { goalOptions, statusOptions, trainingLevelOptions } from "../types/options";
import styles from "./students.module.css";

export interface StudentFiltersProps {
  filters: StudentsListFilters;
  onChange: (filters: StudentsListFilters) => void;
  onReset: () => void;
}

export function StudentFilters({ filters, onChange, onReset }: StudentFiltersProps) {
  return (
    <Card className={styles.filtersCard}>
      <div className={styles.filtersGrid}>
        <FormField htmlFor="students-search" label="جستجو">
          <Input
            id="students-search"
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="جستجو در نام، شماره تماس یا هدف..."
            value={filters.search}
          />
        </FormField>

        <FormField htmlFor="students-level" label="سطح">
          <Select
            id="students-level"
            onChange={(event) =>
              onChange({
                ...filters,
                level: event.target.value as TrainingLevel | "all"
              })
            }
            options={[{ label: "همه سطوح", value: "all" }, ...trainingLevelOptions]}
            value={filters.level}
          />
        </FormField>

        <FormField htmlFor="students-goal" label="هدف">
          <Select
            id="students-goal"
            onChange={(event) =>
              onChange({
                ...filters,
                goal: event.target.value as PrimaryGoal | "all"
              })
            }
            options={[{ label: "همه اهداف", value: "all" }, ...goalOptions]}
            value={filters.goal}
          />
        </FormField>

        <FormField htmlFor="students-status" label="وضعیت">
          <Select
            id="students-status"
            onChange={(event) =>
              onChange({
                ...filters,
                status: event.target.value as StudentStatus | "all"
              })
            }
            options={[{ label: "همه وضعیت ها", value: "all" }, ...statusOptions]}
            value={filters.status}
          />
        </FormField>

        <Button iconStart={<RotateCcw size={18} />} onClick={onReset} variant="secondary">
          پاک کردن فیلترها
        </Button>
      </div>
    </Card>
  );
}
