import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ContentSection, PageContainer, PageHeader } from "../../../components/layout";
import { Card, EmptyState, Skeleton } from "../../../components/ui";
import { StudentForm } from "../components/StudentForm";
import { studentsRepository } from "../services/studentsRepository";
import type { Student, StudentInput } from "../types/student";

export interface StudentFormPageProps {
  mode: "create" | "edit";
}

export function StudentFormPage({ mode }: StudentFormPageProps) {
  const [student, setStudent] = useState<Student | undefined>();
  const [status, setStatus] = useState<"error" | "loaded" | "loading">(
    mode === "edit" ? "loading" : "loaded"
  );
  const navigate = useNavigate();
  const { studentId } = useParams();

  useEffect(() => {
    if (mode === "create") {
      return undefined;
    }

    let isMounted = true;

    studentsRepository
      .getById(studentId ?? "")
      .then((item) => {
        if (!isMounted) {
          return;
        }

        if (!item) {
          setStatus("error");
          return;
        }

        setStudent(item);
        setStatus("loaded");
      })
      .catch(() => {
        if (isMounted) {
          setStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mode, studentId]);

  const handleSubmit = async (input: StudentInput) => {
    if (mode === "edit" && studentId) {
      await studentsRepository.update(studentId, input);
      navigate("/students", {
        state: { studentSaved: "تغییرات شاگرد ذخیره شد." }
      });
      return;
    }

    await studentsRepository.create(input);
    navigate("/students", {
      state: { studentSaved: "شاگرد جدید ذخیره شد." }
    });
  };

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={["داشبورد", "شاگردها", mode === "edit" ? "ویرایش شاگرد" : "افزودن شاگرد جدید"]}
        description="لطفا اطلاعات پایه شاگرد را با دقت تکمیل کنید."
        title={mode === "edit" ? "ویرایش اطلاعات شاگرد" : "فرم اطلاعات پایه شاگرد"}
      />

      <ContentSection>
        {status === "loading" ? (
          <Card>
            <Skeleton height={72} />
            <Skeleton height={220} />
            <Skeleton height={220} />
          </Card>
        ) : null}

        {status === "error" ? (
          <Card padding="lg">
            <EmptyState
              description="شاگرد مورد نظر پیدا نشد یا اطلاعات موقت قابل خواندن نیست."
              title="امکان نمایش فرم وجود ندارد"
            />
          </Card>
        ) : null}

        {status === "loaded" ? (
          <StudentForm
            key={student?.id ?? mode}
            initialStudent={student}
            mode={mode}
            onCancel={() => navigate("/students")}
            onSubmit={handleSubmit}
          />
        ) : null}
      </ContentSection>
    </PageContainer>
  );
}
