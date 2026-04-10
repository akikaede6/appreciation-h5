import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import html2canvas from "html2canvas";

const STORAGE_KEY = "appreciation-review-draft-v6";

function generateId() {
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === "function") {
      const arr = new Uint32Array(4);
      crypto.getRandomValues(arr);
      return Array.from(arr, (n) => n.toString(16)).join("-");
    }
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const initialDraft = {
  title: "",
  cover: "",
  coverOrientation: "portrait", // portrait => 3:4, landscape => 4:3
  comment: "",
  criteria: [],
  customTags: [],
};

function createCriterion(name = "") {
  return {
    id: generateId(),
    name: name || "新维度",
    weight: 1,
    score: 3,
  };
}

function isValidDraft(data) {
  return (
    data &&
    typeof data === "object" &&
    typeof data.title === "string" &&
    typeof data.cover === "string" &&
    typeof data.coverOrientation === "string" &&
    typeof data.comment === "string" &&
    Array.isArray(data.criteria) &&
    Array.isArray(data.customTags)
  );
}

function normalizeDraft(data) {
  if (!isValidDraft(data)) return initialDraft;

  return {
    title: data.title || "",
    cover: data.cover || "",
    coverOrientation: data.coverOrientation === "landscape" ? "landscape" : "portrait",
    comment: data.comment || "",
    customTags: data.customTags
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
    criteria: data.criteria.map((item) => ({
      id: item.id || generateId(),
      name: item.name || "新维度",
      weight: Math.max(1, Number(item.weight) || 1),
      score: Math.min(5, Math.max(1, Number(item.score) || 3)),
    })),
  };
}

function calcFinalScore(criteria) {
  if (!criteria.length) return 0;
  const totalWeight = criteria.reduce((sum, item) => sum + (Number(item.weight) || 1), 0);
  if (!totalWeight) return 0;

  const weightedSum = criteria.reduce((sum, item) => {
    return sum + (Number(item.score) || 0) * (Number(item.weight) || 1);
  }, 0);

  return weightedSum / totalWeight;
}

function getRecommendation(criteria, score) {
  if (!criteria.length) {
    return {
      level: "待评分",
      tone: "先添加评价维度并打分，系统会自动生成推荐结论。",
    };
  }

  if (score >= 4.5) {
    return {
      level: "强推",
      tone: "整体完成度很高，优点比较稳定，适合直接加入推荐名单。",
    };
  }

  if (score >= 4.0) {
    return {
      level: "推荐",
      tone: "综合体验稳，适合多数用户按兴趣尝试。",
    };
  }

  if (score >= 3.0) {
    return {
      level: "可尝试",
      tone: "有亮点，但更建议按个人喜好选择性入。",
    };
  }

  return {
    level: "谨慎尝试",
    tone: "这部作品更吃个人口味，建议先看题材和关键词再决定。",
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "replace":
      return normalizeDraft(action.value);

    case "set_field":
      return { ...state, [action.field]: action.value };

    case "set_score":
      return {
        ...state,
        criteria: state.criteria.map((item) =>
          item.id === action.id ? { ...item, score: action.score } : item
        ),
      };

    case "set_weight":
      return {
        ...state,
        criteria: state.criteria.map((item) =>
          item.id === action.id
            ? { ...item, weight: Math.max(1, Number(action.weight) || 1) }
            : item
        ),
      };

    case "set_name":
      return {
        ...state,
        criteria: state.criteria.map((item) =>
          item.id === action.id ? { ...item, name: action.name } : item
        ),
      };

    case "add_criterion":
      return {
        ...state,
        criteria: [...state.criteria, createCriterion(action.name)],
      };

    case "remove_criterion":
      return {
        ...state,
        criteria: state.criteria.filter((item) => item.id !== action.id),
      };

    case "add_tag": {
      const value = (action.value || "").trim();
      if (!value) return state;
      if (state.customTags.includes(value)) return state;
      return {
        ...state,
        customTags: [...state.customTags, value],
      };
    }

    case "remove_tag":
      return {
        ...state,
        customTags: state.customTags.filter((item) => item !== action.value),
      };

    case "reset":
      return initialDraft;

    default:
      return state;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StarRating({ value, onChange, readonly = false, size = 28 }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {[1, 2, 3, 4, 5].map((num) => (
        <button
          key={num}
          type="button"
          onClick={() => {
            if (!readonly && onChange) onChange(num);
          }}
          style={{
            border: "none",
            background: "transparent",
            cursor: readonly ? "default" : "pointer",
            fontSize: size,
            lineHeight: 1,
            padding: 0,
            color: num <= value ? "#f43f5e" : "#d4d4d8",
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <section className="section-card">
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#18181b" }}>{title}</div>
        {subtitle ? (
          <div style={{ fontSize: 14, color: "#71717a", marginTop: 6, lineHeight: 1.6 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 14,
        fontWeight: 600,
        color: "#3f3f46",
        marginBottom: 8,
      }}
    >
      {children}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: "12px 14px",
        fontSize: 15,
        outline: "none",
        background: "#fff",
        ...props.style,
      }}
    />
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: "12px 14px",
        fontSize: 15,
        outline: "none",
        minHeight: 120,
        resize: "vertical",
        fontFamily: "inherit",
        background: "#fff",
        ...props.style,
      }}
    />
  );
}

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: "12px 14px",
        fontSize: 15,
        outline: "none",
        background: "#fff",
        ...props.style,
      }}
    />
  );
}

function PrimaryButton({ children, style, ...props }) {
  return (
    <button
      {...props}
      type={props.type || "button"}
      style={{
        border: "none",
        borderRadius: 16,
        padding: "12px 16px",
        background: "#f43f5e",
        color: "#fff",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, style, ...props }) {
  return (
    <button
      {...props}
      type={props.type || "button"}
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: "12px 16px",
        background: "#fff",
        color: "#27272a",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function HeaderBlock({ draft, score, recommendation, scalePx }) {
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: scalePx(8) }}>
        <span
          style={{
            background: "#f43f5e",
            color: "#fff",
            borderRadius: 999,
            padding: `${scalePx(6)}px ${scalePx(12)}px`,
            fontSize: scalePx(13),
            fontWeight: 700,
          }}
        >
          作品赏析
        </span>
      </div>

      <div
        style={{
          marginTop: scalePx(14),
          fontSize: scalePx(34),
          lineHeight: 1.2,
          fontWeight: 900,
          wordBreak: "break-word",
        }}
      >
        {draft.title || "未命名作品"}
      </div>

      <div
        style={{
          display: "flex",
          gap: scalePx(16),
          alignItems: "flex-end",
          marginTop: scalePx(18),
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: scalePx(52), lineHeight: 1, fontWeight: 900 }}>
          {score > 0 ? score.toFixed(1) : "--"}
        </div>
        <div>
          <div style={{ fontSize: scalePx(24), fontWeight: 900, color: "#f43f5e" }}>
            {recommendation.level}
          </div>
          <div style={{ marginTop: scalePx(6) }}>
            <StarRating value={Math.round(score)} readonly size={scalePx(24)} />
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: scalePx(16),
          fontSize: scalePx(14),
          color: "#52525b",
          lineHeight: 1.7,
        }}
      >
        {recommendation.tone}
      </div>
    </div>
  );
}

function ShareImage({ draft, score, recommendation, width = 720 }) {
  const scale = width / 720;
  const px = (n) => Math.round(n * scale);
  const isLandscape = draft.coverOrientation === "landscape";
  const tagsToRender = draft.customTags || [];

  return (
    <div
      style={{
        width,
        background: "linear-gradient(180deg, #fff1f2 0%, #ffffff 55%, #fff7ed 100%)",
        padding: px(24),
        boxSizing: "border-box",
        color: "#27272a",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.95)",
          borderRadius: px(28),
          overflow: "hidden",
          boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)",
          border: "1px solid rgba(255,255,255,0.8)",
        }}
      >
        <div style={{ padding: px(24) }}>
          <div style={{ display: "flex", gap: px(16), alignItems: "flex-start" }}>
            <div
              style={{
                width: isLandscape ? px(220) : px(135),
                height: isLandscape ? "auto" : px(180),
                aspectRatio: isLandscape ? "4 / 3" : "3 / 4",
                flexShrink: 0,
                borderRadius: px(20),
                overflow: "hidden",
                border: "1px solid #e4e4e7",
                background: "#f4f4f5",
              }}
            >
              {draft.cover ? (
                <img
                  src={draft.cover}
                  alt={draft.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#a1a1aa",
                    fontSize: px(14),
                  }}
                >
                  未添加封面
                </div>
              )}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <HeaderBlock
                draft={draft}
                score={score}
                recommendation={recommendation}
                scalePx={px}
              />
            </div>
          </div>

          <div style={{ marginTop: px(22) }}>
            {draft.criteria.length ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: px(12),
                }}
              >
                {draft.criteria.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: "rgba(244, 63, 94, 0.08)",
                      borderRadius: px(20),
                      padding: px(14),
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: px(12) }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: px(16) }}>
                          {item.name || "未命名维度"}
                        </div>
                      </div>
                      <div style={{ fontWeight: 900, fontSize: px(28) }}>{item.score}.0</div>
                    </div>
                    <div style={{ marginTop: px(10) }}>
                      <StarRating value={item.score} readonly size={px(24)} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  border: "1px dashed #d4d4d8",
                  borderRadius: px(20),
                  padding: px(18),
                  fontSize: px(14),
                  color: "#71717a",
                  background: "#fafafa",
                }}
              >
                还没有添加评分维度
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: px(20),
              borderRadius: px(20),
              background: "#fafafa",
              padding: px(18),
            }}
          >
            <div
              style={{
                fontSize: px(12),
                color: "#a1a1aa",
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              review
            </div>
            <div
              style={{
                marginTop: px(10),
                whiteSpace: "pre-wrap",
                lineHeight: 1.8,
                fontSize: px(16),
              }}
            >
              {draft.comment || "这次还没有补充评价。"}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: px(8),
              flexWrap: "wrap",
              marginTop: px(18),
              minHeight: px(32),
            }}
          >
            {tagsToRender.map((hint) => (
              <span
                key={hint}
                style={{
                  borderRadius: 999,
                  padding: `${px(7)}px ${px(12)}px`,
                  background: "#ffedd5",
                  color: "#c2410c",
                  fontSize: px(14),
                  fontWeight: 700,
                }}
              >
                #{hint}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [draft, dispatch] = useReducer(reducer, initialDraft);
  const [newCriterionName, setNewCriterionName] = useState("");
  const [newCustomTag, setNewCustomTag] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [saveMessage, setSaveMessage] = useState("本机自动保存中");
  const [showPreview, setShowPreview] = useState(false);
  const exportRef = useRef(null);

  const finalScore = useMemo(() => calcFinalScore(draft.criteria), [draft.criteria]);
  const recommendation = useMemo(
    () => getRecommendation(draft.criteria, finalScore),
    [draft.criteria, finalScore]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        dispatch({ type: "replace", value: JSON.parse(raw) });
        setSaveMessage("已恢复本机草稿");
      }
    } catch (error) {
      console.error("Failed to restore draft", error);
      setSaveMessage("草稿恢复失败");
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setSaveMessage("已自动保存到本机");
    } catch (error) {
      console.error("Failed to save draft", error);
      setSaveMessage("自动保存失败");
    }
  }, [draft, isHydrated]);

  async function handleUpload(file) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    dispatch({ type: "set_field", field: "cover", value: dataUrl });
  }

  function handleAddCriterion() {
    dispatch({ type: "add_criterion", name: newCriterionName.trim() || "新维度" });
    setNewCriterionName("");
  }

  function handleAddCustomTag() {
    dispatch({ type: "add_tag", value: newCustomTag });
    setNewCustomTag("");
  }

  function clearLocalDraft() {
    localStorage.removeItem(STORAGE_KEY);
    dispatch({ type: "reset" });
    setSaveMessage("已清空本机草稿");
  }

  async function exportImage() {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, {
      backgroundColor: null,
      useCORS: true,
      scale: 2,
    });
    const link = document.createElement("a");
    link.download = `${draft.title || "作品赏析推荐"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #fff1f2 0%, #ffffff 50%, #fff7ed 100%)",
        padding: 12,
        boxSizing: "border-box",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: "#18181b",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        .app-shell {
          max-width: 1180px;
          margin: 0 auto;
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(0, 1fr);
        }
        .editor-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(0, 1fr);
        }
        .section-card {
          background: #ffffff;
          border-radius: 24px;
          padding: 18px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
          border: 1px solid rgba(255,255,255,0.8);
        }
        .top-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .top-badge {
          background: #f4f4f5;
          color: #52525b;
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 13px;
          font-weight: 700;
        }
        .two-col {
          display: grid;
          gap: 12px;
          grid-template-columns: 1fr;
        }
        .preview-panel {
          display: grid;
          gap: 16px;
        }
        .sticky-preview {
          position: static;
        }
        .preview-box {
          overflow: auto;
          border-radius: 20px;
          border: 1px solid #e4e4e7;
          background: #f4f4f5;
          padding: 12px;
          display: flex;
          justify-content: center;
        }
        .score-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .inline-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        @media (min-width: 860px) {
          .editor-grid {
            grid-template-columns: minmax(0, 1fr) 420px;
            align-items: start;
          }
          .sticky-preview {
            position: sticky;
            top: 16px;
          }
          .two-col {
            grid-template-columns: 1fr 110px;
          }
        }
        @media (max-width: 520px) {
          .section-card {
            padding: 14px;
            border-radius: 20px;
          }
          .top-badge {
            padding: 6px 10px;
            font-size: 12px;
          }
        }
      `}</style>

      <div className="app-shell">
        <SectionCard
          title="赏析推荐"
          subtitle="同一套代码同时适配手机和电脑。适合写影视剧、广播剧、乙游、小说等内容的评分和赏析图。"
        >
          <div className="top-badges">
            {[saveMessage, "无后端", "本机草稿缓存", "电脑手机双端适配"].map((text) => (
              <span key={text} className="top-badge">
                {text}
              </span>
            ))}
          </div>
        </SectionCard>

        <div className="editor-grid">
          <div style={{ display: "grid", gap: 16 }}>
            <SectionCard title="基本信息">
              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <FieldLabel>封面图</FieldLabel>
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: draft.coverOrientation === "landscape" ? "4 / 3" : "3 / 4",
                      borderRadius: 20,
                      border: "1px solid #e4e4e7",
                      overflow: "hidden",
                      background: "#fafafa",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#a1a1aa",
                      fontSize: 14,
                    }}
                  >
                    {draft.cover ? (
                      <img
                        src={draft.cover}
                        alt={draft.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      "上传封面后会显示在这里"
                    )}
                  </div>

                  <TextInput
                    style={{ marginTop: 12 }}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleUpload(e.target.files?.[0])}
                  />
                </div>

                <div className="two-col">
                  <div>
                    <FieldLabel>作品标题</FieldLabel>
                    <TextInput
                      value={draft.title}
                      onChange={(e) =>
                        dispatch({ type: "set_field", field: "title", value: e.target.value })
                      }
                      placeholder="输入作品标题，比如电影、剧集、广播剧、小说"
                    />
                  </div>

                  <div>
                    <FieldLabel>封面方向</FieldLabel>
                    <SelectInput
                      value={draft.coverOrientation}
                      onChange={(e) =>
                        dispatch({
                          type: "set_field",
                          field: "coverOrientation",
                          value: e.target.value,
                        })
                      }
                    >
                      <option value="portrait">竖图 3:4</option>
                      <option value="landscape">横图 4:3</option>
                    </SelectInput>
                  </div>
                </div>

                <div>
                  <FieldLabel>赏析短评</FieldLabel>
                  <TextArea
                    value={draft.comment}
                    onChange={(e) =>
                      dispatch({ type: "set_field", field: "comment", value: e.target.value })
                    }
                    placeholder="写一句推荐理由、亮点、雷点或适合人群"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="评分维度"
              subtitle="默认留空，按你的内容自由添加，比如剧情、演技、镜头、BGM、沉浸感。空白添加会自动命名为“新维度”。"
            >
              <div style={{ display: "grid", gap: 14 }}>
                {draft.criteria.length ? (
                  draft.criteria.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        border: "1px solid #e4e4e7",
                        borderRadius: 20,
                        padding: 14,
                        background: "#fff",
                      }}
                    >
                      <div className="two-col">
                        <div>
                          <FieldLabel>维度名称</FieldLabel>
                          <TextInput
                            value={item.name}
                            onChange={(e) =>
                              dispatch({ type: "set_name", id: item.id, name: e.target.value })
                            }
                            placeholder="例如：剧情、演技、镜头、声优表现"
                          />
                        </div>

                        <div>
                          <FieldLabel>权重</FieldLabel>
                          <TextInput
                            type="number"
                            min={1}
                            max={10}
                            value={item.weight}
                            onChange={(e) =>
                              dispatch({
                                type: "set_weight",
                                id: item.id,
                                weight: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 14,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, color: "#71717a" }}>当前评分</div>
                          <div style={{ fontSize: 32, fontWeight: 900 }}>{item.score}.0</div>
                        </div>
                        <SecondaryButton
                          onClick={() => dispatch({ type: "remove_criterion", id: item.id })}
                        >
                          删除
                        </SecondaryButton>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <StarRating
                          value={item.score}
                          onChange={(score) => dispatch({ type: "set_score", id: item.id, score })}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      border: "1px dashed #d4d4d8",
                      borderRadius: 20,
                      padding: 16,
                      background: "#fafafa",
                      color: "#71717a",
                      fontSize: 14,
                      lineHeight: 1.8,
                    }}
                  >
                    目前还没有评分维度。你可以先添加“剧情”“演技”“氛围感”之类的项目，再开始打分。
                  </div>
                )}

                <div
                  style={{
                    background: "#fafafa",
                    borderRadius: 20,
                    padding: 14,
                    border: "1px solid #f4f4f5",
                  }}
                >
                  <FieldLabel>新增评分维度</FieldLabel>
                  <div className="inline-actions">
                    <TextInput
                      value={newCriterionName}
                      onChange={(e) => setNewCriterionName(e.target.value)}
                      placeholder="可留空直接添加，之后再改名"
                    />
                    <PrimaryButton onClick={handleAddCriterion}>添加</PrimaryButton>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="推荐结果">
              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    background: "linear-gradient(90deg, #fff1f2 0%, #fff7ed 100%)",
                    borderRadius: 20,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 14,
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: "#71717a" }}>综合分</div>
                      <div style={{ fontSize: 48, lineHeight: 1, fontWeight: 900 }}>
                        {finalScore > 0 ? finalScore.toFixed(1) : "--"}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: "#71717a" }}>推荐结论</div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: "#f43f5e" }}>
                        {recommendation.level}
                      </div>
                      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                        <StarRating value={Math.round(finalScore)} readonly />
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.7, color: "#52525b" }}>
                    {recommendation.tone}
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #f4f4f5",
                    borderRadius: 20,
                    background: "#fafafa",
                    padding: 14,
                  }}
                >
                  <div
                    style={{ fontSize: 14, fontWeight: 700, color: "#27272a", marginBottom: 8 }}
                  >
                    推荐标签
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#71717a",
                      lineHeight: 1.7,
                      marginBottom: 10,
                    }}
                  >
                    tag 由你自己决定添加，不加也可以；如果没有 tag，导图里这一行会留空。
                  </div>

                  <div className="inline-actions" style={{ marginBottom: 10 }}>
                    <TextInput
                      value={newCustomTag}
                      onChange={(e) => setNewCustomTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomTag();
                        }
                      }}
                      placeholder="添加你自己的 tag，例如：哭戏很强、节奏偏慢、适合睡前看"
                    />
                    <PrimaryButton onClick={handleAddCustomTag}>添加 tag</PrimaryButton>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {draft.customTags.length ? (
                      draft.customTags.map((tag) => (
                        <span
                          key={`custom-${tag}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            borderRadius: 999,
                            padding: "7px 12px",
                            background: "#ffedd5",
                            color: "#c2410c",
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          自定义：#{tag}
                          <button
                            type="button"
                            onClick={() => dispatch({ type: "remove_tag", value: tag })}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#c2410c",
                              cursor: "pointer",
                              fontWeight: 900,
                              padding: 0,
                              lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: 13, color: "#a1a1aa" }}>还没有自定义 tag</span>
                    )}
                  </div>
                </div>

                <div className="score-actions">
                  <PrimaryButton style={{ flex: 1 }} onClick={() => setShowPreview(true)}>
                    预览分享图
                  </PrimaryButton>
                  <SecondaryButton onClick={() => dispatch({ type: "reset" })}>
                    重置
                  </SecondaryButton>
                  <SecondaryButton onClick={clearLocalDraft}>清空本机草稿</SecondaryButton>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="preview-panel">
            <div className="sticky-preview">
              <SectionCard
                title="分享图实时预览"
                subtitle="这里现在是实时可见预览。手机单列，电脑侧边栏固定显示。"
              >
                <div className="preview-box">
                  <ShareImage
                    draft={draft}
                    score={finalScore}
                    recommendation={recommendation}
                    width={320}
                  />
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }}>
        <div ref={exportRef} style={{ display: "inline-block" }}>
          <ShareImage
            draft={draft}
            score={finalScore}
            recommendation={recommendation}
            width={900}
          />
        </div>
      </div>

      {showPreview ? (
        <div
          onClick={() => setShowPreview(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(24, 24, 27, 0.55)",
            padding: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 24,
              padding: 16,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800 }}>分享图预览</div>
              <div className="inline-actions">
                <SecondaryButton onClick={() => setShowPreview(false)}>关闭</SecondaryButton>
                <PrimaryButton onClick={exportImage}>导出 PNG</PrimaryButton>
              </div>
            </div>

            <div
              style={{
                overflow: "auto",
                borderRadius: 20,
                border: "1px solid #e4e4e7",
                background: "#f4f4f5",
                padding: 12,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <ShareImage
                draft={draft}
                score={finalScore}
                recommendation={recommendation}
                width={720}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
