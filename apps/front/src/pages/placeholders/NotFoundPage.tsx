import { SearchX } from "lucide-react";
import { ContentSection, PageContainer, PageHeader } from "../../components/layout";
import { Card, EmptyState } from "../../components/ui";

export function NotFoundPage() {
  return (
    <PageContainer>
      <PageHeader
        breadcrumb={["خطا"]}
        description="مسیر واردشده در این نسخه وجود ندارد."
        title="صفحه پیدا نشد"
      />
      <ContentSection>
        <Card padding="lg">
          <EmptyState
            description="آدرس را بررسی کنید یا از ناوبری اصلی استفاده کنید."
            icon={<SearchX size={24} />}
            title="404"
          />
        </Card>
      </ContentSection>
    </PageContainer>
  );
}
