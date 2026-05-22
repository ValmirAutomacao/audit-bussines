import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";
import {
  Database, Shield, AlertTriangle, CheckCircle2, XCircle, ArrowRight,
  Search, Zap, GitBranch, Server, Cloud, Lock,
  RefreshCw, Eye, ChevronRight, ChevronDown, Copy,
  Terminal, FileCode, Table2, Key,
  Clock, Activity, HardDrive, Users,
  Download, Upload, Check, X, Loader2, Bot,
  Plus, Trash2, BookOpen, FileText, Send, Sparkles,
  ShoppingCart, Package, DollarSign, Briefcase,
  MessageSquare, ChevronUp, Save,
  AlertCircle, Waypoints, ArrowDownToLine, Workflow, Braces, ScanSearch, FileWarning, FileCog, Gauge, ClipboardList
} from "lucide-react";

// ─── Design Tokens ───
const t = {
  bg: "#0a0a0f", surface: "#12121a", card: "#1a1a25", elevated: "#22222f",
  text: "#f0f0f5", muted: "#8888a0", dim: "#555570",
  primary: "#6366f1", success: "#10b981", warning: "#f59e0b", danger: "#ef4444", info: "#3b82f6",
  purple: "#8b5cf6", cyan: "#06b6d4", pink: "#ec4899",
  border: "rgba(255,255,255,0.06)", borderMd: "rgba(255,255,255,0.1)", borderStr: "rgba(255,255,255,0.2)",
};

const SECTOR_META = {
  comercial: { icon: ShoppingCart, color: t.warning, label: "Comercial" },
  estoque: { icon: Package, color: t.cyan, label: "Estoque" },
  financeiro: { icon: DollarSign, color: t.success, label: "Financeiro" },
  rh: { icon: Users, color: t.pink, label: "RH" },
  fiscal: { icon: FileText, color: t.purple, label: "Fiscal" },
  compras: { icon: Briefcase, color: t.info, label: "Compras" },
};

// ─── Skill Pipeline Steps ───
const SKILL_STEPS = [
  { id: "parse", label: "Interpretar Prompt", icon: Braces, desc: "Extraindo setor, regras e contexto do prompt" },
  { id: "schema", label: "Mapear Schema", icon: ScanSearch, desc: "Identificando tabelas, triggers e constraints relacionados" },
  { id: "analyze", label: "Analisar Compliance", icon: Gauge, desc: "Cruzando regras com estrutura real do banco" },
  { id: "report", label: "Gerar Documentação", icon: FileCog, desc: "Montando relatório de ajustes e scripts SQL" },
];

// ─── Rich mock analysis data for sectors ───
const SECTOR_ANALYSIS_DB = {
  comercial: {
    tablesScanned: ["vnd_pedido_itens", "vnd_pedidos", "tabelas_prod", "vnd_aprovacoes", "vnd_clientes", "vnd_vendedores", "log_alteracoes"],
    triggersFound: ["tr_validar_desconto"],
    constraintsFound: ["FK_pedido_cliente", "FK_item_produto"],
    constraintsMissing: ["CHK_valor_unitario_tabela", "CHK_assinatura_pedido_alto_valor"],
    findings: [
      {
        rule: "Vendedor não pode alterar valor do produto livremente. Somente via solicitação ao responsável para alteração na tabela tabelas_prod.",
        status: "violation", confidence: 96, priority: "critical",
        detail: "A tabela vnd_pedido_itens permite UPDATE direto na coluna valor_unitario sem trigger de validação. Qualquer usuário com permissão de escrita pode alterar valores sem consultar tabelas_prod.",
        evidence: "SELECT COUNT(*) FROM log_alteracoes WHERE tabela='vnd_pedido_itens' AND coluna='valor_unitario' AND origem != 'tabelas_prod' → 847 registros nos últimos 90 dias",
        tables: ["vnd_pedido_itens", "tabelas_prod", "log_alteracoes"],
        sqlFix: `-- 1. Criar trigger de validação
CREATE TRIGGER tr_validar_preco_venda
ON vnd_pedido_itens
FOR INSERT, UPDATE
AS
BEGIN
  IF EXISTS (
    SELECT 1 FROM inserted i
    LEFT JOIN tabelas_prod tp 
      ON tp.produto_id = i.produto_id 
      AND tp.preco_vigente = i.valor_unitario
    WHERE tp.produto_id IS NULL
  )
  BEGIN
    RAISERROR('Valor unitário deve corresponder à tabela de preços vigente. Solicite alteração ao responsável.', 16, 1)
    ROLLBACK TRANSACTION
  END
END

-- 2. Registrar tentativas bloqueadas
CREATE TABLE log_tentativa_alteracao_preco (
  id INT IDENTITY PRIMARY KEY,
  usuario SYSNAME DEFAULT SUSER_SNAME(),
  produto_id INT,
  valor_tentado DECIMAL(18,2),
  valor_tabela DECIMAL(18,2),
  data_tentativa DATETIME DEFAULT GETDATE()
)`,
        impact: "847 alterações irregulares serão bloqueadas. Vendedores precisarão solicitar via fluxo de aprovação."
      },
      {
        rule: "Desconto acima de 15% exige aprovação do gerente comercial.",
        status: "compliant", confidence: 92, priority: "high",
        detail: "Existe stored procedure sp_aprovar_desconto que verifica percentual e exige token de aprovação do gerente. Trigger tr_validar_desconto está ativo e funcionando.",
        evidence: "EXEC sp_helptext 'sp_aprovar_desconto' → lógica de verificação confirmada. Trigger ativo em vnd_pedidos.",
        tables: ["vnd_pedidos", "vnd_aprovacoes"],
        sqlFix: null,
        impact: null
      }
    ]
  },
  estoque: {
    tablesScanned: ["est_produtos", "est_movimentacoes", "est_inventarios", "est_alertas", "est_lotes", "log_alteracoes"],
    triggersFound: [],
    constraintsFound: ["FK_mov_produto", "FK_lote_produto"],
    constraintsMissing: ["TR_bloquear_update_direto_quantidade", "CHK_origem_movimentacao"],
    findings: [
      {
        rule: "Quantidade de produto no estoque não pode ser alterada diretamente. Somente via inventário interno.",
        status: "violation", confidence: 98, priority: "critical",
        detail: "A coluna est_produtos.quantidade_atual permite UPDATE direto sem qualquer restrição. Não existe trigger, constraint ou permissão granular que force a passagem pelo módulo de inventário.",
        evidence: "SELECT COUNT(*) FROM log_alteracoes WHERE tabela='est_produtos' AND coluna='quantidade_atual' AND origem NOT IN ('est_inventarios','est_movimentacoes') → 14 alterações manuais nos últimos 30 dias",
        tables: ["est_produtos", "est_movimentacoes", "est_inventarios"],
        sqlFix: `-- 1. Revogar UPDATE direto na coluna quantidade
DENY UPDATE ON est_produtos(quantidade_atual) TO [role_operadores]

-- 2. Criar trigger que bloqueia alteração fora do inventário
CREATE TRIGGER tr_bloquear_update_quantidade
ON est_produtos
INSTEAD OF UPDATE
AS
BEGIN
  IF UPDATE(quantidade_atual)
  BEGIN
    -- Verifica se a alteração vem do módulo de inventário
    DECLARE @ctx VARCHAR(128) = CAST(CONTEXT_INFO() AS VARCHAR(128))
    IF @ctx IS NULL OR @ctx != 'INVENTARIO_INTERNO'
    BEGIN
      RAISERROR('Quantidade só pode ser alterada via módulo de inventário. Use o procedimento sp_movimentar_estoque.', 16, 1)
      RETURN
    END
  END
  -- Permitir update se veio do módulo correto
  UPDATE ep SET ep.quantidade_atual = i.quantidade_atual
  FROM est_produtos ep
  INNER JOIN inserted i ON ep.id = i.id
END

-- 3. Procedure obrigatória para movimentações
CREATE PROCEDURE sp_movimentar_estoque
  @produto_id INT, @quantidade INT, @tipo VARCHAR(20), @inventario_id INT
AS
BEGIN
  SET CONTEXT_INFO 0x494E56454E544152494F5F494E5445524E4F -- 'INVENTARIO_INTERNO'
  
  UPDATE est_produtos SET quantidade_atual = quantidade_atual + @quantidade
  WHERE id = @produto_id
  
  INSERT INTO est_movimentacoes (produto_id, quantidade, tipo, inventario_id, data_mov, usuario)
  VALUES (@produto_id, @quantidade, @tipo, @inventario_id, GETDATE(), SUSER_SNAME())
  
  SET CONTEXT_INFO 0x00
END`,
        impact: "14 alterações manuais/mês serão bloqueadas. Todas as movimentações passarão a ter rastreabilidade completa via est_movimentacoes."
      },
      {
        rule: "Produto abaixo do estoque mínimo gera alerta automático para compras.",
        status: "review", confidence: 82, priority: "medium",
        detail: "Existe SQL Agent Job que verifica estoque mínimo diariamente, mas o mecanismo de alerta (Database Mail) está com erro de SMTP desde 15/03/2026. Alertas não estão sendo entregues há 68 dias.",
        evidence: "SELECT TOP 5 * FROM msdb.dbo.sysmail_faileditems ORDER BY last_mod_date DESC → 340 emails falhados desde 15/03",
        tables: ["est_produtos", "est_alertas"],
        sqlFix: `-- 1. Corrigir configuração SMTP
EXEC msdb.dbo.sysmail_update_account_sp
  @account_id = 1,
  @mailserver_name = 'smtp.empresa.com.br',
  @port = 587,
  @enable_ssl = 1

-- 2. Adicionar fallback via tabela de notificações
CREATE TABLE tbl_notificacoes_compras (
  id INT IDENTITY PRIMARY KEY,
  produto_id INT,
  quantidade_atual INT,
  estoque_minimo INT,
  data_alerta DATETIME DEFAULT GETDATE(),
  lido BIT DEFAULT 0,
  lido_por VARCHAR(100),
  lido_em DATETIME
)

-- 3. Trigger de alerta duplo
CREATE TRIGGER tr_alerta_estoque_minimo
ON est_produtos
AFTER UPDATE
AS
BEGIN
  INSERT INTO tbl_notificacoes_compras (produto_id, quantidade_atual, estoque_minimo)
  SELECT i.id, i.quantidade_atual, i.estoque_minimo
  FROM inserted i
  WHERE i.quantidade_atual < i.estoque_minimo
  AND NOT EXISTS (
    SELECT 1 FROM tbl_notificacoes_compras nc 
    WHERE nc.produto_id = i.id AND nc.lido = 0
  )
END`,
        impact: "Alertas voltarão a funcionar. Fallback via tabela garante que o ERP Delphi exiba notificações mesmo com SMTP offline."
      }
    ]
  },
  financeiro: {
    tablesScanned: ["fin_lancamentos", "fin_aprovacoes", "fin_contas_pagar", "fin_contas_receber", "fin_plano_contas", "log_alteracoes"],
    triggersFound: ["tr_atualizar_saldo"],
    constraintsFound: ["FK_lanc_plano_contas"],
    constraintsMissing: ["CHK_dupla_aprovacao_alto_valor", "TR_estorno_gerente_only"],
    findings: [
      {
        rule: "Lançamento contábil acima de R$100.000 exige dupla aprovação.",
        status: "violation", confidence: 95, priority: "critical",
        detail: "A tabela fin_lancamentos não possui nenhum mecanismo de aprovação por alçada. A tabela fin_aprovacoes existe mas contém 0 registros — nunca foi utilizada. Qualquer usuário pode inserir lançamentos de qualquer valor.",
        evidence: "SELECT COUNT(*) FROM fin_aprovacoes → 0 registros. SELECT COUNT(*) FROM fin_lancamentos WHERE valor > 100000 → 23 lançamentos sem aprovação",
        tables: ["fin_lancamentos", "fin_aprovacoes"],
        sqlFix: `-- 1. Reestruturar tabela de aprovações
ALTER TABLE fin_lancamentos ADD status_aprovacao VARCHAR(20) DEFAULT 'pendente'
ALTER TABLE fin_lancamentos ADD aprovador_1 VARCHAR(100)
ALTER TABLE fin_lancamentos ADD aprovador_2 VARCHAR(100)
ALTER TABLE fin_lancamentos ADD data_aprovacao_1 DATETIME
ALTER TABLE fin_lancamentos ADD data_aprovacao_2 DATETIME

-- 2. Trigger de bloqueio
CREATE TRIGGER tr_dupla_aprovacao_lancamento
ON fin_lancamentos
INSTEAD OF UPDATE
AS
BEGIN
  IF EXISTS (SELECT 1 FROM inserted WHERE valor > 100000 AND status_aprovacao = 'aprovado' 
             AND (aprovador_1 IS NULL OR aprovador_2 IS NULL))
  BEGIN
    RAISERROR('Lançamentos acima de R$100.000 exigem dupla aprovação.', 16, 1)
    RETURN
  END
  -- Verificar que aprovadores são diferentes
  IF EXISTS (SELECT 1 FROM inserted WHERE aprovador_1 = aprovador_2 AND aprovador_2 IS NOT NULL)
  BEGIN
    RAISERROR('Os dois aprovadores devem ser pessoas diferentes.', 16, 1)
    RETURN
  END
END`,
        impact: "23 lançamentos altos retroativos precisarão de aprovação. Novos lançamentos >R$100k serão bloqueados até dupla aprovação."
      }
    ]
  }
};

// ─── Other mock data ───
const SCHEMAS_DATA = [
  { name: "dbo", tables: 142, views: 38, procedures: 67, triggers: 23, status: "scanned" },
  { name: "vendas", tables: 45, views: 12, procedures: 28, triggers: 8, status: "scanned" },
  { name: "financeiro", tables: 68, views: 22, procedures: 41, triggers: 15, status: "scanning" },
  { name: "estoque", tables: 37, views: 9, procedures: 19, triggers: 6, status: "scanned" },
  { name: "rh", tables: 29, views: 7, procedures: 15, triggers: 4, status: "pending" },
  { name: "fiscal", tables: 53, views: 18, procedures: 33, triggers: 11, status: "pending" },
];

const AUDIT_ISSUES = [
  { id: 1, severity: "critical", module: "Financeiro", table: "fin_lancamentos", issue: "FK órfã: 2.847 registros sem vínculo em fin_plano_contas", fix: "DELETE ou reassociar registros órfãos + criar constraint", aiConfidence: 94, status: "pending" },
  { id: 2, severity: "critical", module: "Vendas", table: "vnd_pedidos", issue: "Coluna total_pedido com divergência de cálculo em 12% dos registros", fix: "UPDATE recalculando total = SUM(itens.qtd * itens.vlr_unit)", aiConfidence: 97, status: "simulated" },
  { id: 3, severity: "high", module: "Estoque", table: "est_movimentacoes", issue: "Índice ausente em data_movimento — queries 40x mais lentas", fix: "CREATE INDEX idx_mov_data ON est_movimentacoes(data_movimento)", aiConfidence: 99, status: "approved" },
  { id: 4, severity: "high", module: "Fiscal", table: "fis_notas_fiscais", issue: "Constraint CHECK faltando: status aceita valores fora do domínio", fix: "ALTER TABLE ADD CONSTRAINT chk_status CHECK (status IN (...))", aiConfidence: 91, status: "pending" },
  { id: 5, severity: "medium", module: "RH", table: "rh_funcionarios", issue: "CPFs duplicados: 23 registros com mesmo documento", fix: "Merge de registros + ADD UNIQUE CONSTRAINT", aiConfidence: 88, status: "pending" },
  { id: 6, severity: "medium", module: "Vendas", table: "vnd_clientes", issue: "Coluna email sem validação — 340 registros com formato inválido", fix: "UPDATE + ADD CHECK CONSTRAINT com regex de email", aiConfidence: 92, status: "simulated" },
  { id: 7, severity: "low", module: "Estoque", table: "est_produtos", issue: "156 produtos sem categoria — campo nullable sem default", fix: "UPDATE SET categoria = 'Não Categorizado' + ALTER DEFAULT", aiConfidence: 96, status: "approved" },
  { id: 8, severity: "critical", module: "Financeiro", table: "fin_contas_pagar", issue: "Trigger de atualização de saldo com deadlock recorrente", fix: "Reescrever trigger com NOLOCK hints e batch processing", aiConfidence: 85, status: "pending" },
];

const PIPELINE_STEPS = [
  { id: "connect", label: "Conexão", desc: "MCP → SQL Server", icon: Database, status: "complete" },
  { id: "extract", label: "Extração", desc: "Schema + Metadados", icon: Download, status: "complete" },
  { id: "clone", label: "Clone", desc: "Schema → Supabase", icon: Cloud, status: "active" },
  { id: "audit", label: "Auditoria IA", desc: "Análise profunda", icon: Bot, status: "pending" },
  { id: "simulate", label: "Simulação", desc: "Testar alterações", icon: GitBranch, status: "pending" },
  { id: "deploy", label: "Deploy", desc: "Aplicar em produção", icon: Upload, status: "pending" },
];

const DB_METRICS = [
  { label: "Tamanho Total", value: "614 GB", trend: [580, 590, 595, 600, 605, 610, 614], icon: HardDrive },
  { label: "Tabelas", value: "374", trend: [360, 362, 365, 368, 370, 372, 374], icon: Table2 },
  { label: "Procedures", value: "203", trend: [190, 193, 195, 198, 200, 201, 203], icon: FileCode },
  { label: "Conexões Ativas", value: "47", trend: [32, 38, 45, 42, 50, 44, 47], icon: Users },
];

const SEVERITY_CHART = [
  { name: "Crítico", value: 3, fill: t.danger },
  { name: "Alto", value: 2, fill: t.warning },
  { name: "Médio", value: 2, fill: t.info },
  { name: "Baixo", value: 1, fill: t.success },
];

const MODULE_ISSUES = [
  { name: "Financeiro", critical: 2, high: 0, medium: 0, low: 0 },
  { name: "Vendas", critical: 1, high: 0, medium: 1, low: 0 },
  { name: "Estoque", critical: 0, high: 1, medium: 0, low: 1 },
  { name: "Fiscal", critical: 0, high: 1, medium: 0, low: 0 },
  { name: "RH", critical: 0, high: 0, medium: 1, low: 0 },
];

// ─── Small Components ───
const Sparkline = ({ data, color = t.primary, w = 72, h = 24 }) => {
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}><polyline fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" points={pts} /></svg>;
};

const SeverityBadge = ({ severity }) => {
  const m = { critical: { bg: "rgba(239,68,68,0.15)", c: "#ef4444", l: "CRÍTICO" }, high: { bg: "rgba(245,158,11,0.15)", c: "#f59e0b", l: "ALTO" }, medium: { bg: "rgba(59,130,246,0.15)", c: "#3b82f6", l: "MÉDIO" }, low: { bg: "rgba(16,185,129,0.15)", c: "#10b981", l: "BAIXO" } };
  const s = m[severity] || m.medium;
  return <span style={{ background: s.bg, color: s.c, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>{s.l}</span>;
};

const StatusBadge = ({ status }) => {
  const m = { pending: { bg: "rgba(136,136,160,0.12)", c: "#8888a0", l: "Pendente", I: Clock }, simulated: { bg: "rgba(99,102,241,0.12)", c: "#6366f1", l: "Simulado", I: GitBranch }, approved: { bg: "rgba(16,185,129,0.12)", c: "#10b981", l: "Aprovado", I: CheckCircle2 }, applied: { bg: "rgba(59,130,246,0.12)", c: "#3b82f6", l: "Aplicado", I: Check } };
  const s = m[status] || m.pending; const Icon = s.I;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.bg, color: s.c, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}><Icon size={12} /> {s.l}</span>;
};

const ComplianceBadge = ({ status }) => {
  const m = {
    compliant: { bg: "rgba(16,185,129,0.12)", c: t.success, l: "CONFORME", I: CheckCircle2 },
    violation: { bg: "rgba(239,68,68,0.12)", c: t.danger, l: "VIOLAÇÃO", I: XCircle },
    review: { bg: "rgba(245,158,11,0.12)", c: t.warning, l: "REVISAR", I: AlertCircle },
  };
  const s = m[status] || m.review; const Icon = s.I;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.bg, color: s.c, padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}><Icon size={13} /> {s.l}</span>;
};

const PipelineStep = ({ step, isLast }) => {
  const ss = { complete: { ring: t.success, bg: "rgba(16,185,129,0.12)", ic: t.success }, active: { ring: t.primary, bg: "rgba(99,102,241,0.15)", ic: t.primary }, pending: { ring: t.borderStr, bg: "rgba(255,255,255,0.04)", ic: t.dim } };
  const s = ss[step.status]; const Icon = step.icon;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 80 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: s.bg, border: `2px solid ${s.ring}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: step.status === "active" ? "0 0 20px rgba(99,102,241,0.25)" : "none" }}>
          {step.status === "complete" ? <CheckCircle2 size={18} color={s.ic} /> : step.status === "active" ? <Loader2 size={18} color={s.ic} className="spin" /> : <Icon size={18} color={s.ic} />}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: step.status === "pending" ? t.dim : t.text }}>{step.label}</div>
          <div style={{ fontSize: 9, color: t.dim, marginTop: 1 }}>{step.desc}</div>
        </div>
      </div>
      {!isLast && <div style={{ width: 32, height: 2, background: step.status === "complete" ? t.success : t.border, margin: "0 2px", marginBottom: 26, borderRadius: 1 }} />}
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: t.elevated, border: `1px solid ${t.borderMd}`, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: t.muted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.color || t.text, fontWeight: 600 }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

// ─── Render formatted text (basic markdown) ───
const RichText = ({ text, color = t.text }) => (
  <span>
    {text.split(/(\*\*.*?\*\*)/g).map((part, pi) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={pi} style={{ color: t.primary }}>{part.slice(2, -2)}</strong>;
      }
      return part.split(/(`[^`]+`)/g).map((seg, si) => {
        if (seg.startsWith("`") && seg.endsWith("`")) {
          return <code key={`${pi}-${si}`} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, background: "rgba(99,102,241,.12)", padding: "1px 5px", borderRadius: 3, color: t.cyan }}>{seg.slice(1, -1)}</code>;
        }
        return seg;
      });
    })}
  </span>
);

// ═══════════════════════════════════════════
// ─── MAIN APP ───
// ═══════════════════════════════════════════
export default function ERPAuditDashboard() {
  const [activeTab, setActiveTab] = useState("rules");
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");

  // ─── Business Rules (Skill-based) State ───
  const [ruleAnalyses, setRuleAnalyses] = useState([]); // completed analyses
  const [promptInput, setPromptInput] = useState("");
  const [skillRunning, setSkillRunning] = useState(false);
  const [skillStep, setSkillStep] = useState(-1); // current step index
  const [skillStepsDone, setSkillStepsDone] = useState([]);
  const [parsedPreview, setParsedPreview] = useState(null); // preview of parsed rules
  const [expandedAnalysis, setExpandedAnalysis] = useState(null);
  const [expandedFinding, setExpandedFinding] = useState(null);
  const [showSql, setShowSql] = useState(null);
  const [copiedSql, setCopiedSql] = useState(null);
  const [activeDocTab, setActiveDocTab] = useState("findings"); // findings | sql | summary
  const promptRef = useRef(null);

  // ─── Parse prompt for sector detection ───
  const detectSector = (text) => {
    const lower = text.toLowerCase();
    if (lower.includes("comercial") || lower.includes("vendas") || lower.includes("vendedor") || lower.includes("preço") || lower.includes("pedido")) return "comercial";
    if (lower.includes("estoque") || lower.includes("inventário") || lower.includes("quantidade") || lower.includes("produto")) return "estoque";
    if (lower.includes("financeiro") || lower.includes("lançamento") || lower.includes("pagamento") || lower.includes("aprovação") || lower.includes("contábil")) return "financeiro";
    if (lower.includes("rh") || lower.includes("funcionário") || lower.includes("folha")) return "rh";
    if (lower.includes("fiscal") || lower.includes("nota fiscal") || lower.includes("imposto")) return "fiscal";
    if (lower.includes("compra") || lower.includes("fornecedor")) return "compras";
    return null;
  };

  const extractRules = (text) => {
    const rules = [];
    // Try to find numbered rules
    const numbered = text.match(/\d+\s*[-–—.:)]\s*([^\n]+)/g);
    if (numbered && numbered.length > 0) {
      numbered.forEach(r => {
        const clean = r.replace(/^\d+\s*[-–—.:)]\s*/, "").trim();
        if (clean.length > 10) rules.push(clean);
      });
    }
    // If no numbered rules, split by line breaks or "regra"
    if (rules.length === 0) {
      const lines = text.split(/\n|(?:regras?:?\s*)/i).filter(l => l.trim().length > 15);
      lines.forEach(l => {
        const clean = l.replace(/^[-*•]\s*/, "").replace(/^setor:?\s*\w+\s*/i, "").trim();
        if (clean.length > 15) rules.push(clean);
      });
    }
    // Fallback: treat entire prompt as single rule
    if (rules.length === 0 && text.trim().length > 15) {
      rules.push(text.trim());
    }
    return rules;
  };

  // ─── Run Skill Pipeline ───
  const runSkillPipeline = async () => {
    if (!promptInput.trim() || skillRunning) return;
    
    const sector = detectSector(promptInput);
    const rules = extractRules(promptInput);
    
    if (!sector) {
      setParsedPreview({ error: "Não consegui identificar o setor. Mencione: comercial, estoque, financeiro, fiscal, RH ou compras." });
      return;
    }
    
    setParsedPreview({ sector, rules });
    setSkillRunning(true);
    setSkillStep(0);
    setSkillStepsDone([]);

    // Step 0: Parse (already done)
    await new Promise(r => setTimeout(r, 1200));
    setSkillStepsDone(prev => [...prev, "parse"]);
    setSkillStep(1);
    
    // Step 1: Schema mapping
    await new Promise(r => setTimeout(r, 2000));
    setSkillStepsDone(prev => [...prev, "schema"]);
    setSkillStep(2);
    
    // Step 2: Compliance analysis
    await new Promise(r => setTimeout(r, 2500));
    setSkillStepsDone(prev => [...prev, "analyze"]);
    setSkillStep(3);
    
    // Step 3: Generate docs
    await new Promise(r => setTimeout(r, 1500));
    setSkillStepsDone(prev => [...prev, "report"]);

    // Build analysis result
    const sectorData = SECTOR_ANALYSIS_DB[sector];
    const analysis = {
      id: `analysis-${Date.now()}`,
      sector,
      prompt: promptInput,
      rules,
      timestamp: new Date(),
      ...(sectorData || {
        tablesScanned: ["tbl_" + sector + "_1", "tbl_" + sector + "_2"],
        triggersFound: [],
        constraintsFound: [],
        constraintsMissing: ["Constraints a definir"],
        findings: rules.map((r, i) => ({
          rule: r, status: "review", confidence: 75 + Math.floor(Math.random() * 15), priority: "high",
          detail: `Análise preliminar da regra "${r.substring(0, 50)}..." — necessário acesso completo ao schema do setor para validação detalhada.`,
          evidence: "Análise pendente de acesso ao banco completo",
          tables: ["tbl_" + sector], sqlFix: "-- Script será gerado após análise completa", impact: "Impacto a ser determinado"
        }))
      }),
    };

    setTimeout(() => {
      setRuleAnalyses(prev => [analysis, ...prev]);
      setSkillRunning(false);
      setSkillStep(-1);
      setParsedPreview(null);
      setPromptInput("");
      setExpandedAnalysis(analysis.id);
    }, 500);
  };

  // Compliance stats
  const complianceStats = useMemo(() => {
    let total = 0, compliant = 0, violations = 0, reviews = 0;
    ruleAnalyses.forEach(a => {
      a.findings?.forEach(f => {
        total++;
        if (f.status === "compliant") compliant++;
        if (f.status === "violation") violations++;
        if (f.status === "review") reviews++;
      });
    });
    return { total, compliant, violations, reviews, rate: total ? Math.round((compliant / total) * 100) : 0 };
  }, [ruleAnalyses]);

  const filteredIssues = useMemo(() => {
    return AUDIT_ISSUES.filter(issue => {
      const matchSearch = !searchQuery || issue.table.toLowerCase().includes(searchQuery.toLowerCase()) || issue.issue.toLowerCase().includes(searchQuery.toLowerCase()) || issue.module.toLowerCase().includes(searchQuery.toLowerCase());
      const matchSeverity = filterSeverity === "all" || issue.severity === filterSeverity;
      return matchSearch && matchSeverity;
    });
  }, [searchQuery, filterSeverity]);

  const copySql = (sql, id) => {
    navigator.clipboard?.writeText(sql);
    setCopiedSql(id);
    setTimeout(() => setCopiedSql(null), 2000);
  };

  const tabs = [
    { id: "rules", label: "Regras de Negócio", icon: BookOpen, count: complianceStats.violations || null },
    { id: "overview", label: "Visão Geral", icon: Activity },
    { id: "schemas", label: "Schemas", icon: Database },
    { id: "issues", label: "Problemas", icon: AlertTriangle, count: 8 },
    { id: "pipeline", label: "Pipeline", icon: GitBranch },
  ];

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.7 } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideIn { from { opacity:0; transform:translateX(-12px) } to { opacity:1; transform:translateX(0) } }
        @keyframes typing { 0% { opacity:.3 } 50% { opacity:1 } 100% { opacity:.3 } }
        @keyframes glow { 0%,100% { box-shadow:0 0 8px rgba(99,102,241,.2) } 50% { box-shadow:0 0 20px rgba(99,102,241,.5) } }
        .spin { animation: spin 1.5s linear infinite } @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        * { box-sizing:border-box; margin:0; padding:0 }
        ::-webkit-scrollbar { width:5px } ::-webkit-scrollbar-track { background:transparent } ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:3px }
        .card { background:${t.surface}; border:1px solid ${t.border}; border-radius:16px; transition:all 200ms }
        .card:hover { border-color:${t.borderMd} }
        .btn { border:none; cursor:pointer; font-family:inherit; display:inline-flex; align-items:center; gap:6px; transition:all 150ms; font-weight:600 }
        .btn-p { background:${t.primary}; color:#fff; padding:8px 16px; border-radius:8px; font-size:13px }
        .btn-p:hover { background:#818cf8; transform:translateY(-1px) }
        .btn-g { background:transparent; color:${t.muted}; border:1px solid ${t.borderMd}; padding:6px 12px; border-radius:8px; font-size:12px }
        .btn-g:hover { background:rgba(255,255,255,.04); color:${t.text} }
        .btn-danger { background:rgba(239,68,68,.12); color:${t.danger}; padding:6px 12px; border-radius:8px; font-size:12px }
        .btn-danger:hover { background:rgba(239,68,68,.2) }
        .btn-success { background:rgba(16,185,129,.12); color:${t.success}; padding:8px 16px; border-radius:8px; font-size:13px }
        .btn-success:hover { background:rgba(16,185,129,.2) }
        .mono { font-family:'JetBrains Mono',monospace }
        .input { background:${t.surface}; border:1px solid ${t.border}; border-radius:10px; color:${t.text}; font-size:13px; padding:10px 12px; font-family:inherit; outline:none; width:100%; transition:border-color 150ms }
        .input:focus { border-color:${t.primary} }
        textarea.input { resize:vertical; min-height:60px; line-height:1.5 }
        .sql-block { background:#0d0d14; border:1px solid ${t.border}; border-radius:10px; padding:14px; font-family:'JetBrains Mono',monospace; font-size:12px; line-height:1.7; color:#a5b4fc; white-space:pre-wrap; overflow-x:auto; position:relative }
        .sql-block .kw { color:#c084fc } .sql-block .fn { color:#34d399 } .sql-block .str { color:#fbbf24 } .sql-block .cmt { color:#555570; font-style:italic }
        .tab-btn { background:transparent; border:none; color:${t.muted}; padding:8px 14px; font-size:12px; font-weight:500; cursor:pointer; border-bottom:2px solid transparent; font-family:inherit; transition:all 150ms }
        .tab-btn.active { color:${t.primary}; border-bottom-color:${t.primary}; font-weight:600 }
        .tab-btn:hover { color:${t.text} }
      `}</style>

      {/* ─── Header ─── */}
      <header style={{ padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${t.border}`, background: t.surface, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(99,102,241,0.3)" }}>
            <Shield size={18} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>ERP Audit Intelligence</div>
            <div style={{ fontSize: 11, color: t.dim }}>Auditoria + Regras de Negócio via IA • SQL Server → Supabase</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "rgba(16,185,129,0.1)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.2)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.success, animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 12, color: t.success, fontWeight: 600 }}>MCP Conectado</span>
          </div>
        </div>
      </header>

      {/* ─── Tabs ─── */}
      <nav style={{ display: "flex", gap: 2, padding: "12px 24px 0", borderBottom: `1px solid ${t.border}`, overflowX: "auto" }}>
        {tabs.map(tab => {
          const Icon = tab.icon; const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: "transparent", border: "none", cursor: "pointer", color: isActive ? t.primary : t.muted, borderBottom: `2px solid ${isActive ? t.primary : "transparent"}`, fontSize: 13, fontWeight: isActive ? 600 : 500, transition: "all 150ms", marginBottom: -1, fontFamily: "inherit", whiteSpace: "nowrap" }}>
              <Icon size={15} />{tab.label}
              {tab.count && <span style={{ background: t.danger, color: "white", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, minWidth: 18, textAlign: "center" }}>{tab.count}</span>}
            </button>
          );
        })}
      </nav>

      <main style={{ padding: 24, maxWidth: 1440, margin: "0 auto" }}>

        {/* ════════════════════════════════════════════════ */}
        {/* ════════ REGRAS DE NEGÓCIO (MAIN FEATURE) ═════ */}
        {/* ════════════════════════════════════════════════ */}
        {activeTab === "rules" && (
          <div style={{ animation: "fadeIn 400ms ease" }}>

            {/* ─── Prompt Input Area ─── */}
            <div className="card" style={{ padding: 24, marginBottom: 24, borderColor: skillRunning ? `${t.primary}40` : t.border, animation: skillRunning ? "glow 2s ease infinite" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={20} color="white" />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Descreva as Regras de Negócio</div>
                  <div style={{ fontSize: 12, color: t.dim }}>Escreva em linguagem natural. A Skill irá interpretar, analisar o banco e gerar documentação.</div>
                </div>
              </div>

              <div style={{ position: "relative", marginBottom: 12 }}>
                <textarea
                  ref={promptRef}
                  className="input"
                  value={promptInput}
                  onChange={e => setPromptInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) runSkillPipeline(); }}
                  placeholder={`Exemplo:\nSetor: Comercial\nRegras:\n1 - Vendedor não pode alterar valor do produto livremente, somente via solicitação ao responsável para alteração na tabela tabelas_prod\n2 - Desconto acima de 15% precisa de aprovação do gerente`}
                  disabled={skillRunning}
                  style={{ minHeight: 120, lineHeight: 1.6, paddingRight: 60, fontSize: 13, background: skillRunning ? "rgba(99,102,241,.04)" : t.surface }}
                />
                {!skillRunning && promptInput.trim() && (
                  <div style={{ position: "absolute", right: 12, bottom: 12 }}>
                    <button className="btn btn-p" onClick={runSkillPipeline} style={{ borderRadius: 10, padding: "10px 16px", boxShadow: "0 4px 12px rgba(99,102,241,.3)" }}>
                      <Zap size={15} /> Analisar com IA
                    </button>
                  </div>
                )}
              </div>

              {/* Quick examples */}
              {!skillRunning && ruleAnalyses.length === 0 && !promptInput && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: t.dim, paddingTop: 4 }}>Exemplos:</span>
                  {[
                    "Setor Comercial: Vendedor não pode alterar preço do produto",
                    "Setor Estoque: Quantidade só pode ser alterada via inventário",
                    "Setor Financeiro: Lançamento >100k exige dupla aprovação",
                  ].map((ex, i) => (
                    <button key={i} className="btn btn-g" onClick={() => setPromptInput(ex)} style={{ fontSize: 11 }}>
                      <MessageSquare size={11} /> {ex.substring(0, 50)}...
                    </button>
                  ))}
                </div>
              )}

              {/* Parsed preview */}
              {parsedPreview && !parsedPreview.error && !skillRunning && (
                <div style={{ background: "rgba(99,102,241,.06)", border: `1px solid ${t.primary}20`, borderRadius: 10, padding: 14, animation: "fadeIn 200ms ease" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.primary, marginBottom: 8 }}>Pré-visualização:</div>
                  <div style={{ fontSize: 12, color: t.text }}>Setor: <strong>{SECTOR_META[parsedPreview.sector]?.label}</strong></div>
                  {parsedPreview.rules.map((r, i) => <div key={i} style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>{i + 1}. {r}</div>)}
                </div>
              )}
              {parsedPreview?.error && (
                <div style={{ background: "rgba(239,68,68,.06)", border: `1px solid rgba(239,68,68,.15)`, borderRadius: 10, padding: 12, animation: "fadeIn 200ms ease", fontSize: 12, color: t.danger }}>
                  <AlertCircle size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 6 }} />{parsedPreview.error}
                </div>
              )}

              {/* ─── Skill Pipeline Running ─── */}
              {skillRunning && (
                <div style={{ background: "rgba(99,102,241,.04)", border: `1px solid ${t.primary}15`, borderRadius: 12, padding: 20, animation: "fadeIn 300ms ease" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <Bot size={18} color={t.primary} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: t.primary }}>Skill de Auditoria em Execução</span>
                  </div>
                  
                  <div style={{ display: "flex", gap: 0 }}>
                    {SKILL_STEPS.map((step, i) => {
                      const Icon = step.icon;
                      const done = skillStepsDone.includes(step.id);
                      const active = skillStep === i && !done;
                      const pending = skillStep < i;
                      return (
                        <div key={step.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                          {/* Connector line */}
                          {i > 0 && <div style={{ position: "absolute", top: 20, left: 0, right: "50%", height: 2, background: done || active ? t.primary : t.border, transition: "background 300ms" }} />}
                          {i < SKILL_STEPS.length - 1 && <div style={{ position: "absolute", top: 20, left: "50%", right: 0, height: 2, background: done ? t.primary : t.border, transition: "background 300ms" }} />}
                          
                          <div style={{
                            width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, transition: "all 300ms",
                            background: done ? "rgba(16,185,129,.15)" : active ? "rgba(99,102,241,.15)" : "rgba(255,255,255,.04)",
                            border: `2px solid ${done ? t.success : active ? t.primary : t.border}`,
                            boxShadow: active ? "0 0 20px rgba(99,102,241,.3)" : "none",
                          }}>
                            {done ? <CheckCircle2 size={18} color={t.success} /> : active ? <Loader2 size={18} color={t.primary} className="spin" /> : <Icon size={18} color={t.dim} />}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: done ? t.success : active ? t.primary : t.dim, marginTop: 8, textAlign: "center" }}>{step.label}</div>
                          <div style={{ fontSize: 10, color: done ? t.muted : active ? t.primary : t.dim, marginTop: 2, textAlign: "center", maxWidth: 120, opacity: active ? 1 : 0.6 }}>
                            {active ? step.desc : done ? "Concluído" : "Aguardando"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {parsedPreview && (
                    <div style={{ marginTop: 16, padding: 12, background: "rgba(0,0,0,.2)", borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: t.dim }}>Setor detectado: <span style={{ color: SECTOR_META[parsedPreview.sector]?.color, fontWeight: 600 }}>{SECTOR_META[parsedPreview.sector]?.label}</span></div>
                      <div style={{ fontSize: 11, color: t.dim, marginTop: 2 }}>Regras identificadas: <span style={{ color: t.text, fontWeight: 600 }}>{parsedPreview.rules.length}</span></div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── Analyses Results ─── */}
            {ruleAnalyses.length > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                    <ClipboardList size={18} color={t.primary} /> Análises Realizadas
                    <span style={{ fontSize: 11, color: t.dim, fontWeight: 400 }}>{ruleAnalyses.length} análise{ruleAnalyses.length > 1 ? "s" : ""}</span>
                  </div>
                  {complianceStats.total > 0 && (
                    <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                      <span style={{ color: t.success, fontWeight: 600 }}>✓ {complianceStats.compliant} conforme</span>
                      <span style={{ color: t.danger, fontWeight: 600 }}>✗ {complianceStats.violations} violações</span>
                      <span style={{ color: t.warning, fontWeight: 600 }}>? {complianceStats.reviews} revisão</span>
                    </div>
                  )}
                </div>

                {ruleAnalyses.map((analysis, ai) => {
                  const meta = SECTOR_META[analysis.sector] || SECTOR_META.comercial;
                  const SectorIcon = meta.icon;
                  const isExpanded = expandedAnalysis === analysis.id;
                  const violations = analysis.findings?.filter(f => f.status === "violation").length || 0;
                  const compliant = analysis.findings?.filter(f => f.status === "compliant").length || 0;
                  const reviews = analysis.findings?.filter(f => f.status === "review").length || 0;

                  return (
                    <div key={analysis.id} className="card" style={{ marginBottom: 16, borderLeft: `3px solid ${meta.color}`, animation: `fadeIn 400ms ease ${ai * 80}ms both` }}>
                      
                      {/* Analysis Header */}
                      <div style={{ padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }} onClick={() => setExpandedAnalysis(isExpanded ? null : analysis.id)}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${meta.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <SectorIcon size={22} color={meta.color} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                            {meta.label}
                            <span style={{ fontSize: 11, color: t.dim, fontWeight: 400 }}>{analysis.findings?.length || 0} regras analisadas</span>
                          </div>
                          <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>
                            {analysis.tablesScanned?.length || 0} tabelas • {analysis.triggersFound?.length || 0} triggers • {analysis.constraintsMissing?.length || 0} constraints faltando
                          </div>
                          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                            {compliant > 0 && <span style={{ fontSize: 11, color: t.success, fontWeight: 600 }}>✓ {compliant} conforme</span>}
                            {violations > 0 && <span style={{ fontSize: 11, color: t.danger, fontWeight: 600 }}>✗ {violations} violação</span>}
                            {reviews > 0 && <span style={{ fontSize: 11, color: t.warning, fontWeight: 600 }}>? {reviews} revisão</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: t.dim }}>{analysis.timestamp?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                        {isExpanded ? <ChevronUp size={18} color={t.muted} /> : <ChevronDown size={18} color={t.muted} />}
                      </div>

                      {/* ─── Expanded Analysis Content ─── */}
                      {isExpanded && (
                        <div style={{ padding: "0 20px 20px", animation: "fadeIn 300ms ease" }}>
                          
                          {/* Prompt that generated this */}
                          <div style={{ background: "rgba(99,102,241,.04)", borderRadius: 10, padding: 12, marginBottom: 16, border: `1px solid ${t.primary}10` }}>
                            <div style={{ fontSize: 11, color: t.primary, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}><MessageSquare size={11} /> Prompt enviado</div>
                            <div style={{ fontSize: 12, color: t.muted, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{analysis.prompt}</div>
                          </div>

                          {/* Schema info bar */}
                          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                            <div style={{ padding: "6px 12px", background: "rgba(6,182,212,.06)", borderRadius: 8, fontSize: 11, color: t.cyan, display: "flex", alignItems: "center", gap: 4 }}>
                              <Table2 size={12} /> {analysis.tablesScanned?.join(", ")}
                            </div>
                          </div>

                          {/* Sub-tabs: Findings | SQL Scripts | Summary */}
                          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${t.border}`, marginBottom: 16 }}>
                            {[
                              { id: "findings", label: "Diagnósticos", icon: ScanSearch },
                              { id: "sql", label: "Scripts SQL", icon: Terminal },
                              { id: "summary", label: "Documentação", icon: FileText },
                            ].map(tab => {
                              const TabIcon = tab.icon;
                              return (
                                <button key={tab.id} className={`tab-btn ${activeDocTab === tab.id ? "active" : ""}`} onClick={() => setActiveDocTab(tab.id)}>
                                  <TabIcon size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> {tab.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* FINDINGS TAB */}
                          {activeDocTab === "findings" && analysis.findings?.map((finding, fi) => {
                            const isFExp = expandedFinding === `${analysis.id}-${fi}`;
                            return (
                              <div key={fi} style={{
                                marginBottom: 10, borderRadius: 12, overflow: "hidden",
                                border: `1px solid ${finding.status === "violation" ? "rgba(239,68,68,.12)" : finding.status === "compliant" ? "rgba(16,185,129,.12)" : "rgba(245,158,11,.12)"}`,
                                background: finding.status === "violation" ? "rgba(239,68,68,.02)" : finding.status === "compliant" ? "rgba(16,185,129,.02)" : "rgba(245,158,11,.02)"
                              }}>
                                <div style={{ padding: 14, cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }} onClick={() => setExpandedFinding(isFExp ? null : `${analysis.id}-${fi}`)}>
                                  <div style={{ width: 26, height: 26, borderRadius: 7, background: `${meta.color}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: meta.color, flexShrink: 0 }}>{fi + 1}</div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, lineHeight: 1.5, color: t.text, marginBottom: 6 }}>{finding.rule}</div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                      <ComplianceBadge status={finding.status} />
                                      <SeverityBadge severity={finding.priority} />
                                      <span style={{ fontSize: 11, color: t.primary, display: "flex", alignItems: "center", gap: 3 }}><Bot size={11} /> {finding.confidence}%</span>
                                    </div>
                                  </div>
                                  {isFExp ? <ChevronUp size={16} color={t.muted} /> : <ChevronDown size={16} color={t.muted} />}
                                </div>

                                {isFExp && (
                                  <div style={{ padding: "0 14px 14px", animation: "fadeIn 200ms ease" }}>
                                    <div style={{ background: t.bg, borderRadius: 10, padding: 16, border: `1px solid ${t.border}` }}>
                                      
                                      <div style={{ fontSize: 12, fontWeight: 600, color: t.muted, marginBottom: 6 }}>Análise detalhada</div>
                                      <div style={{ fontSize: 13, color: t.text, lineHeight: 1.6, marginBottom: 14 }}>{finding.detail}</div>

                                      {finding.evidence && (
                                        <div style={{ marginBottom: 14 }}>
                                          <div style={{ fontSize: 11, fontWeight: 600, color: t.cyan, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}><Search size={11} /> Evidência</div>
                                          <div className="mono" style={{ fontSize: 11, color: t.cyan, background: "rgba(6,182,212,.06)", padding: 10, borderRadius: 6, lineHeight: 1.5 }}>{finding.evidence}</div>
                                        </div>
                                      )}

                                      {finding.tables && (
                                        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                                          <span style={{ fontSize: 11, color: t.dim }}>Tabelas afetadas:</span>
                                          {finding.tables.map(tbl => <span key={tbl} className="mono" style={{ fontSize: 11, color: t.cyan, background: "rgba(6,182,212,.08)", padding: "2px 8px", borderRadius: 4 }}>{tbl}</span>)}
                                        </div>
                                      )}

                                      {finding.impact && (
                                        <div style={{ background: "rgba(99,102,241,.04)", border: `1px solid ${t.primary}10`, borderRadius: 8, padding: 12, marginBottom: 14 }}>
                                          <div style={{ fontSize: 11, fontWeight: 600, color: t.primary, marginBottom: 4 }}>Impacto estimado</div>
                                          <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>{finding.impact}</div>
                                        </div>
                                      )}

                                      {finding.sqlFix && finding.sqlFix !== "-- Script será gerado após análise completa" && (
                                        <div>
                                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: t.success, display: "flex", alignItems: "center", gap: 4 }}><Zap size={12} /> Script de Correção</div>
                                            <button className="btn btn-g" style={{ fontSize: 11 }} onClick={() => copySql(finding.sqlFix, `${analysis.id}-${fi}`)}>
                                              {copiedSql === `${analysis.id}-${fi}` ? <><Check size={12} /> Copiado!</> : <><Copy size={12} /> Copiar SQL</>}
                                            </button>
                                          </div>
                                          <div className="sql-block" style={{ maxHeight: 300, overflowY: "auto" }}>
                                            {finding.sqlFix.split('\n').map((line, li) => {
                                              if (line.trim().startsWith('--')) return <div key={li} style={{ color: t.dim, fontStyle: "italic" }}>{line}</div>;
                                              return <div key={li}>{line.split(/\b(CREATE|ALTER|INSERT|UPDATE|DELETE|SELECT|FROM|WHERE|BEGIN|END|IF|ELSE|SET|DECLARE|TRIGGER|ON|FOR|AS|INTO|VALUES|NOT|NULL|AND|OR|EXISTS|IN|DEFAULT|TABLE|PROCEDURE|ROLLBACK|TRANSACTION|RAISERROR|RETURN|INNER|LEFT|JOIN|DENY|AFTER|INSTEAD OF)\b/gi).map((w, wi) => {
                                                if (/^(CREATE|ALTER|INSERT|UPDATE|DELETE|SELECT|FROM|WHERE|BEGIN|END|IF|ELSE|SET|DECLARE|TRIGGER|ON|FOR|AS|INTO|VALUES|NOT|NULL|AND|OR|EXISTS|IN|DEFAULT|TABLE|PROCEDURE|ROLLBACK|TRANSACTION|RAISERROR|RETURN|INNER|LEFT|JOIN|DENY|AFTER|INSTEAD OF)$/i.test(w)) return <span key={wi} style={{ color: "#c084fc" }}>{w}</span>;
                                                return w;
                                              })}</div>;
                                            })}
                                          </div>
                                        </div>
                                      )}

                                      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                                        <button className="btn btn-p" style={{ fontSize: 12 }}><GitBranch size={13} /> Simular no Supabase</button>
                                        <button className="btn btn-g"><Eye size={13} /> Preview de Impacto</button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* SQL TAB */}
                          {activeDocTab === "sql" && (
                            <div style={{ animation: "fadeIn 200ms ease" }}>
                              <div style={{ fontSize: 12, color: t.muted, marginBottom: 12 }}>Todos os scripts de correção consolidados para o setor <strong style={{ color: meta.color }}>{meta.label}</strong>:</div>
                              {analysis.findings?.filter(f => f.sqlFix && f.sqlFix !== "-- Script será gerado após análise completa").map((f, fi) => (
                                <div key={fi} style={{ marginBottom: 16 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <ComplianceBadge status={f.status} />
                                      <span style={{ fontSize: 12, color: t.text, fontWeight: 500 }}>{f.rule.substring(0, 60)}...</span>
                                    </div>
                                    <button className="btn btn-g" style={{ fontSize: 11 }} onClick={() => copySql(f.sqlFix, `sql-${analysis.id}-${fi}`)}>
                                      {copiedSql === `sql-${analysis.id}-${fi}` ? <><Check size={12} /> Copiado!</> : <><Copy size={12} /> Copiar</>}
                                    </button>
                                  </div>
                                  <div className="sql-block" style={{ maxHeight: 250, overflowY: "auto" }}>
                                    {f.sqlFix.split('\n').map((line, li) => {
                                      if (line.trim().startsWith('--')) return <div key={li} style={{ color: t.dim, fontStyle: "italic" }}>{line}</div>;
                                      return <div key={li}>{line.split(/\b(CREATE|ALTER|INSERT|UPDATE|DELETE|SELECT|FROM|WHERE|BEGIN|END|IF|ELSE|SET|DECLARE|TRIGGER|ON|FOR|AS|INTO|VALUES|NOT|NULL|AND|OR|EXISTS|IN|DEFAULT|TABLE|PROCEDURE|ROLLBACK|TRANSACTION|RAISERROR|RETURN|INNER|LEFT|JOIN|DENY|AFTER|INSTEAD OF)\b/gi).map((w, wi) => {
                                        if (/^(CREATE|ALTER|INSERT|UPDATE|DELETE|SELECT|FROM|WHERE|BEGIN|END|IF|ELSE|SET|DECLARE|TRIGGER|ON|FOR|AS|INTO|VALUES|NOT|NULL|AND|OR|EXISTS|IN|DEFAULT|TABLE|PROCEDURE|ROLLBACK|TRANSACTION|RAISERROR|RETURN|INNER|LEFT|JOIN|DENY|AFTER|INSTEAD OF)$/i.test(w)) return <span key={wi} style={{ color: "#c084fc" }}>{w}</span>;
                                        return w;
                                      })}</div>;
                                    })}
                                  </div>
                                </div>
                              )) || <div style={{ fontSize: 12, color: t.dim, padding: 20, textAlign: "center" }}>Nenhum script de correção necessário — todas as regras estão em conformidade.</div>}
                              
                              {analysis.findings?.some(f => f.sqlFix && f.sqlFix !== "-- Script será gerado após análise completa") && (
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                  <button className="btn btn-p"><Download size={14} /> Exportar .sql</button>
                                  <button className="btn btn-success"><GitBranch size={14} /> Simular Todos no Supabase</button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* SUMMARY/DOC TAB */}
                          {activeDocTab === "summary" && (
                            <div style={{ animation: "fadeIn 200ms ease" }}>
                              <div style={{ background: t.bg, borderRadius: 12, padding: 20, border: `1px solid ${t.border}` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                  <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                                    <FileText size={18} color={t.primary} /> Documentação de Ajustes — {meta.label}
                                  </div>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button className="btn btn-g"><Download size={13} /> PDF</button>
                                    <button className="btn btn-g"><Copy size={13} /> Markdown</button>
                                  </div>
                                </div>

                                {/* Report header */}
                                <div className="mono" style={{ background: t.surface, borderRadius: 10, padding: 16, marginBottom: 16, fontSize: 12, lineHeight: 2, color: t.muted, whiteSpace: "pre-wrap" }}>
{`╔════════════════════════════════════════════════════════════╗
║  DOCUMENTAÇÃO DE AJUSTES — ${meta.label.toUpperCase().padEnd(30)}║
║  Gerado: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR').padEnd(18)}       ║
║  Método: Skill de Auditoria IA via MCP                     ║
╠════════════════════════════════════════════════════════════╣
║  Regras Analisadas:    ${String(analysis.findings?.length || 0).padEnd(35)}║
║  Tabelas Verificadas:  ${String(analysis.tablesScanned?.length || 0).padEnd(35)}║
║  Triggers Encontrados: ${String(analysis.triggersFound?.length || 0).padEnd(35)}║
║  Constraints Faltando: ${String(analysis.constraintsMissing?.length || 0).padEnd(35)}║
║  ─────────────────────────────────────────────────────     ║
║  ✓ Conforme:     ${String(compliant).padEnd(41)}║
║  ✗ Violações:    ${String(violations).padEnd(41)}║
║  ? Revisão:      ${String(reviews).padEnd(41)}║
╚════════════════════════════════════════════════════════════╝`}
                                </div>

                                {/* Findings in doc format */}
                                {analysis.findings?.map((f, fi) => (
                                  <div key={fi} style={{
                                    padding: 16, marginBottom: 12, borderRadius: 12,
                                    border: `1px solid ${f.status === "violation" ? "rgba(239,68,68,.12)" : f.status === "compliant" ? "rgba(16,185,129,.12)" : "rgba(245,158,11,.12)"}`,
                                    background: f.status === "violation" ? "rgba(239,68,68,.02)" : f.status === "compliant" ? "rgba(16,185,129,.02)" : "rgba(245,158,11,.02)"
                                  }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                      <ComplianceBadge status={f.status} />
                                      <span style={{ fontSize: 13, fontWeight: 700 }}>Regra {fi + 1}</span>
                                      <span style={{ fontSize: 11, color: t.primary }}>{f.confidence}% confiança</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: t.muted, marginBottom: 8, fontStyle: "italic", lineHeight: 1.5 }}>"{f.rule}"</div>
                                    <div style={{ fontSize: 12, color: t.text, lineHeight: 1.6, marginBottom: 8 }}>{f.detail}</div>
                                    {f.impact && <div style={{ fontSize: 12, padding: "8px 12px", background: "rgba(99,102,241,.04)", borderRadius: 6, color: t.muted, marginBottom: 8 }}><strong style={{ color: t.primary }}>Impacto:</strong> {f.impact}</div>}
                                    {f.sqlFix && f.sqlFix !== "-- Script será gerado após análise completa" && (
                                      <div style={{ fontSize: 12, padding: "8px 12px", background: "rgba(16,185,129,.04)", borderRadius: 6, color: t.success, display: "flex", alignItems: "flex-start", gap: 6 }}>
                                        <Zap size={13} style={{ marginTop: 2, flexShrink: 0 }} /> Solução SQL disponível na aba "Scripts SQL"
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {ruleAnalyses.length === 0 && !skillRunning && (
              <div style={{ textAlign: "center", padding: "48px 20px" }}>
                <BookOpen size={40} color={t.dim} style={{ marginBottom: 16 }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Nenhuma análise realizada ainda</div>
                <div style={{ fontSize: 13, color: t.dim, maxWidth: 400, margin: "0 auto", lineHeight: 1.5 }}>
                  Descreva as regras de negócio no campo acima. A IA irá analisar o banco automaticamente e gerar a documentação de ajustes.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════ OVERVIEW ════════════════════ */}
        {activeTab === "overview" && (
          <div style={{ animation: "fadeIn 400ms ease" }}>
            <div className="card" style={{ padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><GitBranch size={16} color={t.primary} /> Pipeline de Auditoria</div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", overflowX: "auto", padding: "8px 0" }}>
                {PIPELINE_STEPS.map((step, i) => <PipelineStep key={step.id} step={step} isLast={i === PIPELINE_STEPS.length - 1} />)}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
              {DB_METRICS.map((m, i) => {
                const Icon = m.icon;
                return (
                  <div key={i} className="card" style={{ padding: 20, animation: `fadeIn 400ms ease ${i * 80}ms both` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 11, color: t.dim, fontWeight: 500, textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>{m.label}</div>
                        <div className="mono" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>{m.value}</div>
                      </div>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(99,102,241,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} color={t.primary} /></div>
                    </div>
                    <div style={{ marginTop: 12 }}><Sparkline data={m.trend} /></div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 16, marginBottom: 20 }}>
              <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 11, color: t.dim, fontWeight: 500, textTransform: "uppercase", letterSpacing: .8, marginBottom: 12 }}>Compliance Score</div>
                <div style={{ position: "relative", width: 100, height: 100 }}>
                  <svg width={100} height={100} viewBox="0 0 100 100">
                    <circle cx={50} cy={50} r={42} fill="none" stroke={t.border} strokeWidth={8} />
                    <circle cx={50} cy={50} r={42} fill="none" stroke={complianceStats.rate > 70 ? t.success : complianceStats.rate > 40 ? t.warning : t.danger} strokeWidth={8} strokeDasharray={`${complianceStats.rate * 2.64} 264`} strokeLinecap="round" transform="rotate(-90 50 50)" style={{ transition: "stroke-dasharray 1s ease" }} />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{complianceStats.rate}%</div>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 11 }}>
                  <span style={{ color: t.success }}>✓ {complianceStats.compliant}</span>
                  <span style={{ color: t.danger }}>✗ {complianceStats.violations}</span>
                  <span style={{ color: t.warning }}>? {complianceStats.reviews}</span>
                </div>
              </div>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Problemas por Módulo</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={MODULE_ISSUES} layout="vertical" barCategoryGap={6}>
                    <XAxis type="number" stroke={t.dim} fontSize={11} />
                    <YAxis dataKey="name" type="category" stroke={t.dim} fontSize={11} width={75} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="critical" stackId="a" fill={t.danger} name="Crítico" />
                    <Bar dataKey="high" stackId="a" fill={t.warning} name="Alto" />
                    <Bar dataKey="medium" stackId="a" fill={t.info} name="Médio" />
                    <Bar dataKey="low" stackId="a" fill={t.success} radius={[0, 4, 4, 0]} name="Baixo" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Severidade</div>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart><Pie data={SEVERITY_CHART} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value" strokeWidth={0}>{SEVERITY_CHART.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie></PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 8 }}>
                  {SEVERITY_CHART.map((s, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: t.muted }}><div style={{ width: 7, height: 7, borderRadius: 2, background: s.fill }} />{s.name}</div>)}
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={16} color={t.warning} /> Problemas Recentes</div>
                <button className="btn btn-g" onClick={() => setActiveTab("issues")}>Ver todos <ChevronRight size={14} /></button>
              </div>
              {AUDIT_ISSUES.slice(0, 3).map((issue, i) => (
                <div key={issue.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < 2 ? `1px solid ${t.border}` : "none" }}>
                  <SeverityBadge severity={issue.severity} />
                  <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{issue.issue}</div><div style={{ fontSize: 11, color: t.dim, marginTop: 2 }}><span className="mono">{issue.table}</span> • {issue.module}</div></div>
                  <StatusBadge status={issue.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════ SCHEMAS ════════════════════ */}
        {activeTab === "schemas" && (
          <div style={{ animation: "fadeIn 400ms ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div><div style={{ fontSize: 18, fontWeight: 700 }}>Mapeamento de Schemas</div><div style={{ fontSize: 12, color: t.dim, marginTop: 4 }}>Inventário completo extraído via MCP do SQL Server</div></div>
              <button className="btn btn-p"><RefreshCw size={14} /> Re-escanear</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {SCHEMAS_DATA.map((schema, i) => (
                <div key={schema.name} className="card" style={{ padding: 20, animation: `fadeIn 300ms ease ${i * 60}ms both` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Database size={16} color={t.primary} /><span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{schema.name}</span></div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: schema.status === "scanned" ? "rgba(16,185,129,.12)" : schema.status === "scanning" ? "rgba(99,102,241,.12)" : "rgba(136,136,160,.08)", color: schema.status === "scanned" ? t.success : schema.status === "scanning" ? t.primary : t.dim }}>
                      {schema.status === "scanned" ? "✓ Escaneado" : schema.status === "scanning" ? "⟳ Escaneando..." : "Pendente"}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[{ label: "Tabelas", value: schema.tables, icon: Table2 }, { label: "Views", value: schema.views, icon: Eye }, { label: "Procedures", value: schema.procedures, icon: FileCode }, { label: "Triggers", value: schema.triggers, icon: Zap }].map(item => {
                      const Ic = item.icon;
                      return <div key={item.label} style={{ padding: 10, background: "rgba(255,255,255,.02)", borderRadius: 8 }}><div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: t.dim, marginBottom: 4 }}><Ic size={11} /> {item.label}</div><div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{item.value}</div></div>;
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: 24, marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Terminal size={16} color={t.primary} /> Arquitetura MCP</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, padding: "16px 0", flexWrap: "wrap" }}>
                {[{ label: "ERP Delphi", sub: "SQL Server", icon: Server, color: t.warning }, null, { label: "MCP Server", sub: "Read-only", icon: Key, color: t.primary }, null, { label: "Skill IA", sub: "Auditoria+Regras", icon: Bot, color: t.purple }, null, { label: "Supabase", sub: "Clone/Staging", icon: Cloud, color: t.success }].map((item, i) => {
                  if (!item) return <div key={i} style={{ display: "flex", alignItems: "center", padding: "0 8px", marginBottom: 20 }}><ArrowRight size={20} color={t.dim} /></div>;
                  const Ic = item.icon;
                  return (<div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 100 }}><div style={{ width: 52, height: 52, borderRadius: 14, background: `${item.color}15`, border: `2px solid ${item.color}40`, display: "flex", alignItems: "center", justifyContent: "center" }}><Ic size={22} color={item.color} /></div><div style={{ textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</div><div style={{ fontSize: 10, color: t.dim }}>{item.sub}</div></div></div>);
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════ ISSUES ════════════════════ */}
        {activeTab === "issues" && (
          <div style={{ animation: "fadeIn 400ms ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div><div style={{ fontSize: 18, fontWeight: 700 }}>Problemas Identificados pela IA</div><div style={{ fontSize: 12, color: t.dim, marginTop: 4 }}>{filteredIssues.length} problemas • Confiança média: 93%</div></div>
              <div style={{ display: "flex", gap: 8 }}><button className="btn btn-g"><Download size={14} /> Exportar</button><button className="btn btn-p"><Zap size={14} /> Simular Todos</button></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: "0 12px" }}>
                <Search size={14} color={t.dim} />
                <input type="text" placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ background: "transparent", border: "none", outline: "none", color: t.text, fontSize: 13, padding: "10px 0", width: "100%", fontFamily: "inherit" }} />
              </div>
              {["all", "critical", "high", "medium", "low"].map(sev => (
                <button key={sev} onClick={() => setFilterSeverity(sev)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${filterSeverity === sev ? t.primary : t.border}`, background: filterSeverity === sev ? "rgba(99,102,241,.12)" : t.surface, color: filterSeverity === sev ? t.primary : t.muted, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                  {sev === "all" ? "Todos" : sev === "critical" ? "Crítico" : sev === "high" ? "Alto" : sev === "medium" ? "Médio" : "Baixo"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredIssues.map((issue, i) => (
                <div key={issue.id} className="card" style={{ padding: 16, cursor: "pointer", borderLeft: `3px solid ${issue.severity === "critical" ? t.danger : issue.severity === "high" ? t.warning : issue.severity === "medium" ? t.info : t.success}` }} onClick={() => setSelectedIssue(selectedIssue === issue.id ? null : issue.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <SeverityBadge severity={issue.severity} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{issue.issue}</div><div style={{ display: "flex", gap: 12, fontSize: 11, color: t.dim }}><span className="mono" style={{ color: t.primary }}>{issue.table}</span><span>•</span><span>{issue.module}</span></div></div>
                    <StatusBadge status={issue.status} />
                    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "rgba(99,102,241,.08)", borderRadius: 6, fontSize: 12, fontWeight: 600, color: t.primary }}><Bot size={13} /> {issue.aiConfidence}%</div>
                  </div>
                  {selectedIssue === issue.id && (
                    <div style={{ marginTop: 16, padding: 16, background: "rgba(0,0,0,.3)", borderRadius: 10, animation: "fadeIn 200ms ease" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: t.success, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><Zap size={13} /> Solução proposta</div>
                      <div style={{ fontSize: 13, color: t.muted, marginBottom: 12 }}>{issue.fix}</div>
                      <div style={{ display: "flex", gap: 8 }}><button className="btn btn-p" style={{ fontSize: 12 }}><GitBranch size={13} /> Simular</button><button className="btn btn-g"><Eye size={13} /> Impacto</button></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════ PIPELINE ════════════════════ */}
        {activeTab === "pipeline" && (
          <div style={{ animation: "fadeIn 400ms ease" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Pipeline de Migração Segura</div>
            <div style={{ fontSize: 12, color: t.dim, marginBottom: 24 }}>SQL Server → MCP → Skill IA → Supabase → Produção</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { phase: "1", title: "Conexão via MCP", status: "complete", color: t.success, desc: "MCP Server conectado ao SQL Server read-only.", details: ["MCP → ODBC → SQL Server", "Windows Auth / SQL Auth", "db_datareader", "Timeout: 30s"] },
                  { phase: "2", title: "Extração de Schema", status: "complete", color: t.success, desc: "INFORMATION_SCHEMA + sys.objects escaneados.", details: ["374 tabelas", "203 procedures", "147 views", "67 triggers"] },
                  { phase: "3", title: "Clone para Supabase", status: "active", color: t.primary, desc: "T-SQL → PostgreSQL em andamento.", details: ["Conversão DDL", "Amostra 5% (≈30GB)", "Constraints preservadas", "68% concluído"] },
                  { phase: "4", title: "Skill de Auditoria IA", status: "pending", color: t.dim, desc: "Análise de regras de negócio via prompt.", details: ["Parser de regras", "Análise de compliance", "Geração de scripts", "Documentação"] },
                  { phase: "5", title: "Simulação", status: "pending", color: t.dim, desc: "Correções testadas no Supabase.", details: ["Ambiente isolado", "Diff automático", "Testes de regressão", "Relatório de impacto"] },
                  { phase: "6", title: "Deploy", status: "pending", color: t.dim, desc: "Scripts aplicados em produção.", details: ["PG → T-SQL", "Backup pré-deploy", "Janela de manutenção", "Rollback automático"] },
                ].map((step, i) => (
                  <div key={i} className="card" style={{ padding: 16, borderLeft: `3px solid ${step.color}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${step.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: step.color }}>{step.phase}</div>
                      <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{step.title}</div>
                      {step.status === "complete" && <CheckCircle2 size={18} color={t.success} />}
                      {step.status === "active" && <Loader2 size={18} color={t.primary} className="spin" />}
                      {step.status === "pending" && <Clock size={18} color={t.dim} />}
                    </div>
                    <div style={{ fontSize: 12, color: t.muted, marginBottom: 10 }}>{step.desc}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                      {step.details.map((d, j) => <div key={j} style={{ fontSize: 11, color: t.dim, display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 3, height: 3, borderRadius: "50%", background: step.color, flexShrink: 0 }} />{d}</div>)}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Lock size={16} color={t.success} /> Checklist de Segurança</div>
                  {[
                    { label: "Backup completo antes do deploy", done: true },
                    { label: "Scripts de rollback preparados", done: true },
                    { label: "Regras de negócio validadas via Skill", done: false },
                    { label: "Ambiente staging validado", done: false },
                    { label: "Testes de regressão passando", done: false },
                    { label: "Aprovação do DBA", done: false },
                    { label: "Janela de manutenção agendada", done: false },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 6 ? `1px solid ${t.border}` : "none" }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: item.done ? "rgba(16,185,129,.15)" : "rgba(255,255,255,.04)", border: `1.5px solid ${item.done ? t.success : t.borderMd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {item.done && <Check size={12} color={t.success} />}
                      </div>
                      <span style={{ fontSize: 12, color: item.done ? t.text : t.muted }}>{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Fluxo de Dados</div>
                  <svg width="100%" viewBox="0 0 360 420">
                    {[
                      { x: 180, y: 36, label: "SQL Server", sub: "614GB Prod", color: t.warning },
                      { x: 180, y: 130, label: "MCP Server", sub: "Gateway", color: t.primary },
                      { x: 90, y: 230, label: "Skill IA", sub: "Auditoria+Regras", color: t.purple },
                      { x: 270, y: 230, label: "Supabase", sub: "Staging PG", color: t.success },
                      { x: 180, y: 340, label: "Relatório", sub: "Doc de Ajustes", color: t.info },
                    ].map((n, i) => (
                      <g key={i}>
                        <rect x={n.x - 62} y={n.y - 20} width={124} height={40} rx={10} fill={`${n.color}15`} stroke={`${n.color}40`} strokeWidth={1.5} />
                        <text x={n.x} y={n.y - 3} textAnchor="middle" fill={t.text} fontSize={11} fontWeight={600} fontFamily="DM Sans">{n.label}</text>
                        <text x={n.x} y={n.y + 11} textAnchor="middle" fill={t.dim} fontSize={9} fontFamily="DM Sans">{n.sub}</text>
                      </g>
                    ))}
                    <defs><marker id="ah" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><polygon points="0 0,7 2.5,0 5" fill={t.dim} /></marker></defs>
                    <line x1={180} y1={56} x2={180} y2={110} stroke={t.warning} strokeWidth={1.5} strokeDasharray="4,4" markerEnd="url(#ah)" opacity={.6} />
                    <line x1={155} y1={150} x2={110} y2={210} stroke={t.primary} strokeWidth={1.5} strokeDasharray="4,4" markerEnd="url(#ah)" opacity={.6} />
                    <line x1={205} y1={150} x2={250} y2={210} stroke={t.primary} strokeWidth={1.5} strokeDasharray="4,4" markerEnd="url(#ah)" opacity={.6} />
                    <line x1={110} y1={250} x2={160} y2={320} stroke={t.purple} strokeWidth={1.5} strokeDasharray="4,4" markerEnd="url(#ah)" opacity={.6} />
                    <line x1={250} y1={250} x2={200} y2={320} stroke={t.success} strokeWidth={1.5} strokeDasharray="4,4" markerEnd="url(#ah)" opacity={.6} />
                    <path d="M242 340Q340 340 340 190Q340 56 242 36" fill="none" stroke={t.danger} strokeWidth={1.5} strokeDasharray="6,4" markerEnd="url(#ah)" opacity={.4} />
                    <text x={348} y={190} fill={t.danger} fontSize={9} fontFamily="DM Sans" opacity={.6}>Deploy</text>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
