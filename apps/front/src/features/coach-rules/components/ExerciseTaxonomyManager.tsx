import { useState } from "react";
import { Archive, Pencil, Plus, RotateCcw, Save } from "lucide-react";
import { Button, EditorDrawer, FormField, Input, Modal, StatusBadge } from "../../../components/ui";
import { apiRequest } from "../../../shared/api/client";
import type { ExerciseTaxonomy, TaxonomyMuscle, TaxonomyRegion } from "./exerciseTaxonomyTypes";
import styles from "../../programs/components/programFlow.module.css";

type MuscleDraft = { name: string; name_en: string };
type RegionDraft = MuscleDraft & { muscle: TaxonomyMuscle };
type PendingArchive = { id: string; kind: "muscle" | "region"; name: string };

const emptyMuscle: MuscleDraft = { name: "", name_en: "" };

export function ExerciseTaxonomyManager({
  taxonomy,
  onTaxonomyChanged
}: {
  taxonomy: ExerciseTaxonomy;
  onTaxonomyChanged: (taxonomy: ExerciseTaxonomy) => void;
}) {
  const [muscleDraft, setMuscleDraft] = useState<MuscleDraft>();
  const [muscleBaseline, setMuscleBaseline] = useState<MuscleDraft>();
  const [muscleEditingId, setMuscleEditingId] = useState<string>();
  const [regionDraft, setRegionDraft] = useState<RegionDraft>();
  const [regionBaseline, setRegionBaseline] = useState<RegionDraft>();
  const [regionEditingId, setRegionEditingId] = useState<string>();
  const [pendingArchive, setPendingArchive] = useState<PendingArchive>();
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshTaxonomy = async () => {
    const updated = await apiRequest<ExerciseTaxonomy>("/exercise-taxonomy/", {
      query: { include_inactive: true }
    });
    onTaxonomyChanged(updated);
  };

  const startCreateMuscle = () => {
    setMuscleDraft({ ...emptyMuscle });
    setMuscleBaseline({ ...emptyMuscle });
    setMuscleEditingId(undefined);
  };

  const startEditMuscle = (muscle: TaxonomyMuscle) => {
    const next = { name: muscle.name, name_en: muscle.name_en || "" };
    setMuscleDraft(next);
    setMuscleBaseline(next);
    setMuscleEditingId(muscle.id);
  };

  const saveMuscle = async () => {
    if (!muscleDraft) return;
    setSaving(true);
    setFeedback("");
    try {
      await apiRequest(
        muscleEditingId
          ? `/exercise-taxonomy/muscles/${muscleEditingId}/`
          : "/exercise-taxonomy/muscles/",
        { body: muscleDraft, method: muscleEditingId ? "PATCH" : "POST" }
      );
      await refreshTaxonomy();
      setMuscleDraft(undefined);
      setMuscleBaseline(undefined);
      setFeedback(
        muscleEditingId
          ? "عضله ویرایش شد؛ تغییر برای همه مربی‌ها اعمال شد."
          : "عضله به فهرست مشترک اضافه شد."
      );
    } catch {
      setFeedback("ذخیره عضله انجام نشد؛ نام تکراری یا اطلاعات نامعتبر را بررسی کنید.");
    } finally {
      setSaving(false);
    }
  };

  const startCreateRegion = (muscle: TaxonomyMuscle) => {
    const next = { ...emptyMuscle, muscle };
    setRegionDraft(next);
    setRegionBaseline(next);
    setRegionEditingId(undefined);
  };

  const startEditRegion = (muscle: TaxonomyMuscle, region: TaxonomyRegion) => {
    const next = {
      muscle,
      name: region.name,
      name_en: region.name_en || ""
    };
    setRegionDraft(next);
    setRegionBaseline(next);
    setRegionEditingId(region.id);
  };

  const saveRegion = async () => {
    if (!regionDraft) return;
    setSaving(true);
    setFeedback("");
    try {
      await apiRequest(
        regionEditingId
          ? `/exercise-taxonomy/regions/${regionEditingId}/`
          : `/exercise-taxonomy/muscles/${regionDraft.muscle.id}/regions/`,
        {
          body: { name: regionDraft.name, name_en: regionDraft.name_en },
          method: regionEditingId ? "PATCH" : "POST"
        }
      );
      await refreshTaxonomy();
      setRegionDraft(undefined);
      setRegionBaseline(undefined);
      setFeedback(
        regionEditingId
          ? "ناحیه ویرایش شد؛ تغییر برای همه مربی‌ها اعمال شد."
          : "ناحیه به فهرست مشترک اضافه شد."
      );
    } catch {
      setFeedback("ذخیره ناحیه انجام نشد؛ نام تکراری یا اطلاعات نامعتبر را بررسی کنید.");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (item: PendingArchive, isActive: boolean) => {
    setSaving(true);
    setFeedback("");
    try {
      const path =
        item.kind === "muscle"
          ? `/exercise-taxonomy/muscles/${item.id}/`
          : `/exercise-taxonomy/regions/${item.id}/`;
      await apiRequest(path, { body: { is_active: isActive }, method: "PATCH" });
      await refreshTaxonomy();
      setPendingArchive(undefined);
      setFeedback(
        isActive
          ? "مورد دوباره در فهرست مشترک فعال شد."
          : "مورد از گزینه‌های فعال کنار گذاشته شد؛ اطلاعات حرکات قبلی حفظ شده است."
      );
    } catch {
      setFeedback("تغییر وضعیت انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  const muscles = [...taxonomy.muscles].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "fa")
  );

  return (
    <details className={styles.taxonomyDisclosure}>
      <summary className={styles.taxonomyDisclosureSummary}>
        <span>مدیریت عضله‌ها و ناحیه‌ها</span>
        <StatusBadge variant="warning">مشترک برای همه مربی‌ها</StatusBadge>
      </summary>
      <section className={styles.taxonomyManager}>
        <div className={styles.taxonomyManagerHeader}>
          <div>
            <h3 className={styles.ruleCardTitle}>تعریف‌ها از هم جدا هستند</h3>
            <p className={styles.sectionDescription}>
              عضله، گروه اصلی هدف تمرین است؛ ناحیه، بخش مشخصی از همان عضله است و همیشه زیر عضله‌ی
              خودش قرار می‌گیرد. تغییرها در فهرست همه‌ی مربی‌ها دیده می‌شوند.
            </p>
          </div>
        </div>

        {feedback ? (
          <div className={styles.taxonomyFeedback} role="status">
            {feedback}
          </div>
        ) : null}

        <div className={styles.taxonomyGroup}>
          <div className={styles.taxonomyManagerHeader}>
            <div>
              <h4 className={styles.ruleCardTitle}>عضله‌ها</h4>
              <p className={styles.sectionDescription}>
                گزینه‌های فیلتر عضله و عضله‌ی اصلی/فرعی حرکت.
              </p>
            </div>
            <Button iconStart={<Plus size={17} />} onClick={startCreateMuscle} size="sm">
              افزودن عضله
            </Button>
          </div>
          <div className={styles.taxonomyItems}>
            {muscles.map((muscle) => (
              <TaxonomyItem
                key={muscle.id || muscle.key}
                active={muscle.is_active !== false}
                code={muscle.key}
                name={muscle.name}
                onActivate={() =>
                  void setActive({ id: muscle.id, kind: "muscle", name: muscle.name }, true)
                }
                onArchive={() =>
                  setPendingArchive({ id: muscle.id, kind: "muscle", name: muscle.name })
                }
                onEdit={() => startEditMuscle(muscle)}
              />
            ))}
          </div>
        </div>

        <div className={styles.taxonomyGroup}>
          <div className={styles.taxonomyManagerHeader}>
            <div>
              <h4 className={styles.ruleCardTitle}>ناحیه‌های عضله</h4>
              <p className={styles.sectionDescription}>
                ناحیه‌ها در فیلتر و فرم حرکت با نام عضله‌ی والد نمایش داده می‌شوند؛ مثلاً «سینه —
                بالاسینه».
              </p>
            </div>
          </div>
          <div className={styles.pageStack}>
            {muscles.map((muscle) => (
              <section className={styles.taxonomyRegionGroup} key={muscle.id || muscle.key}>
                <div className={styles.taxonomyManagerHeader}>
                  <strong>ناحیه‌های عضله‌ی {muscle.name}</strong>
                  <Button
                    disabled={muscle.is_active === false}
                    iconStart={<Plus size={16} />}
                    onClick={() => startCreateRegion(muscle)}
                    size="sm"
                    variant="secondary"
                  >
                    ناحیه جدید
                  </Button>
                </div>
                {muscle.regions.length ? (
                  <div className={styles.taxonomyItems}>
                    {muscle.regions.map((region) => (
                      <TaxonomyItem
                        key={region.id || `${muscle.key}-${region.key}`}
                        active={region.is_active !== false}
                        code={`${muscle.key} / ${region.key}`}
                        name={region.name}
                        onActivate={() =>
                          void setActive({ id: region.id, kind: "region", name: region.name }, true)
                        }
                        activateDisabled={muscle.is_active === false}
                        onArchive={() =>
                          setPendingArchive({ id: region.id, kind: "region", name: region.name })
                        }
                        onEdit={() => startEditRegion(muscle, region)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className={styles.sectionDescription}>
                    برای این عضله هنوز ناحیه‌ای ثبت نشده است.
                  </p>
                )}
              </section>
            ))}
          </div>
        </div>

        {muscleDraft ? (
          <EditorDrawer
            footer={(requestClose) => (
              <>
                <Button
                  iconStart={<Save size={17} />}
                  isLoading={saving}
                  onClick={() => void saveMuscle()}
                >
                  ذخیره عضله
                </Button>
                <Button onClick={requestClose} variant="secondary">
                  انصراف
                </Button>
              </>
            )}
            hasUnsavedChanges={Boolean(
              muscleDraft &&
              muscleBaseline &&
              JSON.stringify(muscleDraft) !== JSON.stringify(muscleBaseline)
            )}
            onClose={() => {
              setMuscleDraft(undefined);
              setMuscleBaseline(undefined);
            }}
            open
            title={muscleEditingId ? "ویرایش عضله" : "افزودن عضله به فهرست مشترک"}
          >
            <TaxonomyFields draft={muscleDraft} onChange={(next) => setMuscleDraft(next)} />
            {muscleEditingId ? (
              <p className={styles.sectionDescription}>
                شناسه‌ی فنی ثابت است و عوض نمی‌شود؛ نام نمایشی در فهرست همه‌ی مربی‌ها تغییر می‌کند.
              </p>
            ) : null}
          </EditorDrawer>
        ) : null}

        {regionDraft ? (
          <EditorDrawer
            footer={(requestClose) => (
              <>
                <Button
                  iconStart={<Save size={17} />}
                  isLoading={saving}
                  onClick={() => void saveRegion()}
                >
                  ذخیره ناحیه
                </Button>
                <Button onClick={requestClose} variant="secondary">
                  انصراف
                </Button>
              </>
            )}
            hasUnsavedChanges={Boolean(
              regionDraft &&
              regionBaseline &&
              JSON.stringify(regionDraft) !== JSON.stringify(regionBaseline)
            )}
            onClose={() => {
              setRegionDraft(undefined);
              setRegionBaseline(undefined);
            }}
            open
            title={
              regionEditingId ? "ویرایش ناحیه عضله" : `افزودن ناحیه برای ${regionDraft.muscle.name}`
            }
          >
            <p className={styles.sectionDescription}>عضله‌ی والد: {regionDraft.muscle.name}</p>
            <TaxonomyFields
              draft={regionDraft}
              onChange={(next) => setRegionDraft({ ...next, muscle: regionDraft.muscle })}
            />
            {regionEditingId ? (
              <p className={styles.sectionDescription}>
                ناحیه به عضله‌ی والدش متصل می‌ماند؛ شناسه‌ی فنی ثابت است.
              </p>
            ) : null}
          </EditorDrawer>
        ) : null}

        <Modal
          footer={
            <>
              <Button onClick={() => setPendingArchive(undefined)} variant="secondary">
                انصراف
              </Button>
              <Button
                iconStart={<Archive size={17} />}
                isLoading={saving}
                onClick={() => pendingArchive && void setActive(pendingArchive, false)}
                variant="danger"
              >
                غیرفعال‌کردن برای همه
              </Button>
            </>
          }
          onClose={() => setPendingArchive(undefined)}
          open={Boolean(pendingArchive)}
          title="غیرفعال‌کردن گزینه‌ی مشترک"
        >
          <p>
            «{pendingArchive?.name}» از فیلترها و انتخاب‌های جدید همه‌ی مربی‌ها حذف می‌شود. رکوردهای
            حرکت قبلی پاک نمی‌شوند؛ در صورت استفاده در هدف اصلی، generator دیگر آن حرکت را انتخاب
            نمی‌کند.
          </p>
        </Modal>
      </section>
    </details>
  );
}

function TaxonomyFields({
  draft,
  onChange
}: {
  draft: MuscleDraft;
  onChange: (draft: MuscleDraft) => void;
}) {
  return (
    <div className={styles.pageStack}>
      <FormField htmlFor="exercise-taxonomy-name" label="نام فارسی" required>
        <Input
          id="exercise-taxonomy-name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </FormField>
      <FormField htmlFor="exercise-taxonomy-name-en" label="نام انگلیسی (اختیاری)">
        <Input
          id="exercise-taxonomy-name-en"
          value={draft.name_en}
          onChange={(event) => onChange({ ...draft, name_en: event.target.value })}
        />
      </FormField>
    </div>
  );
}

function TaxonomyItem({
  activateDisabled = false,
  active,
  code,
  name,
  onActivate,
  onArchive,
  onEdit
}: {
  activateDisabled?: boolean;
  active: boolean;
  code: string;
  name: string;
  onActivate: () => void;
  onArchive: () => void;
  onEdit: () => void;
}) {
  return (
    <div className={styles.taxonomyItem}>
      <div className={styles.taxonomyItemInfo}>
        <div className={styles.taxonomyManagerHeader}>
          <strong>{name}</strong>
          <StatusBadge variant={active ? "success" : "neutral"}>
            {active ? "فعال" : "غیرفعال"}
          </StatusBadge>
        </div>
        <small dir="ltr">{code}</small>
      </div>
      <div className={styles.taxonomyItemActions}>
        <Button iconStart={<Pencil size={15} />} onClick={onEdit} size="sm" variant="secondary">
          ویرایش
        </Button>
        {active ? (
          <Button iconStart={<Archive size={15} />} onClick={onArchive} size="sm" variant="danger">
            غیرفعال
          </Button>
        ) : (
          <Button
            disabled={activateDisabled}
            iconStart={<RotateCcw size={15} />}
            onClick={onActivate}
            size="sm"
            title={activateDisabled ? "ابتدا عضله‌ی والد را فعال کنید" : undefined}
            variant="secondary"
          >
            فعال‌سازی
          </Button>
        )}
      </div>
    </div>
  );
}
