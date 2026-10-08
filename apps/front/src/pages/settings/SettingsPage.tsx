import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";
import { PageContainer, PageHeader } from "../../components/layout";
import { Button, Card, FormField, Select } from "../../components/ui";
import { apiRequest } from "../../shared/api/client";
import { ApiError, persianMessageForApiError } from "../../shared/api/errors";
import {
  type Calendar,
  getCalendar,
  setCalendar,
  subscribeCalendar
} from "../../shared/dates/calendar";

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const current = useSyncExternalStore(subscribeCalendar, getCalendar);
  const [selected, setSelected] = useState<Calendar>(current);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true);
    try {
      const data = await apiRequest<{ calendar: Calendar }>("/me/date-settings/", {
        method: "PATCH",
        body: { calendar: selected }
      });
      setMessage("تنظیم تقویم ذخیره شد.");
      setParams({ saved: "1" }, { replace: true });
      setCalendar(data.calendar);
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : "ذخیره تنظیم تقویم ناموفق بود."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageContainer>
      <PageHeader
        title="تنظیمات"
        description="تنظیم نمایش تاریخ در پنل مربی، شاگردها و فایل‌های جدید"
      />
      <Card>
        <FormField label="تقویم تاریخ‌ها" htmlFor="calendar-setting">
          <Select
            id="calendar-setting"
            value={selected}
            onChange={(event) => setSelected(event.target.value as Calendar)}
            options={[
              { value: "persian", label: "شمسی (پیش‌فرض)" },
              { value: "gregory", label: "میلادی" }
            ]}
          />
        </FormField>
        <p>
          همهٔ تاریخ‌ها با تقویم انتخابی و ساعت تهران نمایش داده می‌شوند. PDFهای قبلاً ساخته‌شده
          تغییر نمی‌کنند؛ برای تقویم جدید PDF را دوباره بسازید.
        </p>
        <Button disabled={busy || current === selected} onClick={() => void save()}>
          ذخیره تنظیمات
        </Button>
        {message || params.get("saved") === "1" ? (
          <p role="status">{message || "تنظیم تقویم ذخیره شد."}</p>
        ) : null}
      </Card>
    </PageContainer>
  );
}
