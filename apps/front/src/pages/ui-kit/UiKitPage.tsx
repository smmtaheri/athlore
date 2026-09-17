import { useState } from "react";
import { Download, Eye, Plus, Save, Search, Trash2 } from "lucide-react";
import {
  ContentSection,
  Inline,
  PageContainer,
  PageHeader,
  ResponsiveGrid,
  Stack
} from "../../components/layout";
import {
  Button,
  Card,
  Checkbox,
  Divider,
  DropdownMenu,
  EmptyState,
  FormField,
  IconButton,
  Input,
  Modal,
  Pagination,
  Radio,
  SectionTitle,
  Select,
  Skeleton,
  StatusBadge,
  Switch,
  Table,
  Tabs,
  Textarea
} from "../../components/ui";
import styles from "./uiKit.module.css";

interface DemoRow {
  id: number;
  status: "active" | "draft" | "error";
  title: string;
}

const demoRows: DemoRow[] = [
  { id: 1, status: "active", title: "آیتم نمونه یک" },
  { id: 2, status: "draft", title: "آیتم نمونه دو" },
  { id: 3, status: "error", title: "آیتم نمونه سه" }
];

const statusLabel = {
  active: "فعال",
  draft: "پیش نویس",
  error: "خطا"
} as const;

const statusVariant = {
  active: "success",
  draft: "warning",
  error: "danger"
} as const;

export function UiKitPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [switchChecked, setSwitchChecked] = useState(true);

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={["Frontend", "UI Kit"]}
        description="نمایش primitive componentها، tokenهای اصلی و stateهای پایه برای مرحله اول Frontend."
        title="UI Kit"
      />

      <Stack gap="24px">
        <ContentSection>
          <SectionTitle>رنگ ها و وضعیت ها</SectionTitle>
          <ResponsiveGrid columns={4}>
            <ColorSwatch name="Primary" token="--color-primary-600" />
            <ColorSwatch name="Success" token="--color-success-500" />
            <ColorSwatch name="Warning" token="--color-warning-500" />
            <ColorSwatch name="Danger" token="--color-danger-500" />
          </ResponsiveGrid>
        </ContentSection>

        <ContentSection>
          <SectionTitle>دکمه ها</SectionTitle>
          <Card>
            <Inline>
              <Button iconStart={<Save size={18} />}>ذخیره</Button>
              <Button iconStart={<Plus size={18} />} variant="secondary">
                افزودن
              </Button>
              <Button variant="ghost">اکشن متنی</Button>
              <Button iconStart={<Trash2 size={18} />} variant="danger">
                حذف
              </Button>
              <Button isLoading>در حال انجام</Button>
              <IconButton aria-label="مشاهده" icon={<Eye size={20} />} />
            </Inline>
          </Card>
        </ContentSection>

        <ContentSection>
          <SectionTitle>فرم ها</SectionTitle>
          <Card>
            <ResponsiveGrid columns={2}>
              <FormField htmlFor="demo-name" label="فیلد متنی" required>
                <Input id="demo-name" placeholder="متن نمونه" />
              </FormField>
              <FormField htmlFor="demo-select" label="انتخاب">
                <Select
                  id="demo-select"
                  options={[
                    { label: "گزینه اول", value: "one" },
                    { label: "گزینه دوم", value: "two" }
                  ]}
                  placeholder="انتخاب کنید"
                />
              </FormField>
              <FormField
                error="این پیام فقط نمونه state خطاست."
                htmlFor="demo-error"
                label="فیلد خطادار"
              >
                <Input id="demo-error" invalid placeholder="نیازمند اصلاح" />
              </FormField>
              <FormField htmlFor="demo-textarea" label="متن بلند">
                <Textarea id="demo-textarea" placeholder="یادداشت نمونه" />
              </FormField>
            </ResponsiveGrid>
            <Divider />
            <Inline>
              <Checkbox label="گزینه checkbox" />
              <Radio label="گزینه radio" name="demo-radio" />
              <Switch
                checked={switchChecked}
                label="وضعیت فعال"
                onCheckedChange={setSwitchChecked}
              />
            </Inline>
          </Card>
        </ContentSection>

        <ContentSection>
          <SectionTitle>تب، جدول و منو</SectionTitle>
          <Card>
            <Tabs
              items={[
                {
                  content: (
                    <Table
                      ariaLabel="جدول نمونه"
                      columns={[
                        {
                          cell: (row) => row.title,
                          header: "عنوان",
                          id: "title"
                        },
                        {
                          cell: (row) => (
                            <StatusBadge variant={statusVariant[row.status]}>
                              {statusLabel[row.status]}
                            </StatusBadge>
                          ),
                          header: "وضعیت",
                          id: "status"
                        },
                        {
                          align: "end",
                          cell: () => (
                            <DropdownMenu
                              items={[
                                {
                                  icon: <Eye size={16} />,
                                  label: "مشاهده",
                                  onSelect: () => undefined
                                },
                                {
                                  icon: <Download size={16} />,
                                  label: "دانلود",
                                  onSelect: () => undefined
                                }
                              ]}
                            />
                          ),
                          header: "عملیات",
                          id: "actions"
                        }
                      ]}
                      data={demoRows}
                      getRowKey={(row) => row.id}
                    />
                  ),
                  id: "table",
                  label: "جدول"
                },
                {
                  content: (
                    <EmptyState
                      action={<Button iconStart={<Search size={18} />}>جستجو</Button>}
                      title="حالت خالی"
                    />
                  ),
                  id: "empty",
                  label: "حالت خالی"
                }
              ]}
            />
          </Card>
        </ContentSection>

        <ContentSection>
          <SectionTitle>Modal، Pagination و Loading</SectionTitle>
          <Card>
            <Stack>
              <Inline>
                <Button onClick={() => setModalOpen(true)} variant="secondary">
                  باز کردن Modal
                </Button>
                <Pagination onPageChange={setPage} page={page} pageCount={3} />
              </Inline>
              <ResponsiveGrid columns={3}>
                <Skeleton height={56} />
                <Skeleton height={56} />
                <Skeleton height={56} />
              </ResponsiveGrid>
            </Stack>
          </Card>
        </ContentSection>
      </Stack>

      <Modal
        footer={
          <Inline>
            <Button onClick={() => setModalOpen(false)}>تایید</Button>
            <Button onClick={() => setModalOpen(false)} variant="secondary">
              انصراف
            </Button>
          </Inline>
        }
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        title="Modal نمونه"
      >
        <p className={styles.modalText}>این پنجره فقط foundation تعاملی Modal را نشان می دهد.</p>
      </Modal>
    </PageContainer>
  );
}

interface ColorSwatchProps {
  name: string;
  token: string;
}

function ColorSwatch({ name, token }: ColorSwatchProps) {
  return (
    <Card className={styles.swatchCard} padding="sm">
      <span aria-hidden className={styles.swatch} style={{ background: `var(${token})` }} />
      <strong>{name}</strong>
      <code>{token}</code>
    </Card>
  );
}
