import { FileClock } from "lucide-react";
import { ContentSection, PageContainer, PageHeader } from "../../components/layout";
import { Card, EmptyState } from "../../components/ui";

export interface PlaceholderPageProps {
  breadcrumb?: string[];
  description: string;
  title: string;
}

export function PlaceholderPage({ breadcrumb, description, title }: PlaceholderPageProps) {
  return (
    <PageContainer>
      <PageHeader breadcrumb={breadcrumb} description={description} title={title} />
      <ContentSection>
        <Card padding="lg">
          <EmptyState
            description="در این مرحله فقط ساختار فنی، App Shell و کامپوننت های پایه آماده شده اند."
            icon={<FileClock size={24} />}
            title="پیاده سازی این صفحه در مرحله بعد انجام می شود"
          />
        </Card>
      </ContentSection>
    </PageContainer>
  );
}
