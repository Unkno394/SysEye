export type AgentStatus = "online" | "offline" | "busy";

export type Agent = {
  id: string;
  name: string;
  hostname: string;
  os: "Windows" | "Linux";
  ip: string;
  status: AgentStatus;
  lastSeen: string;
  tags: string[];
  cpu: number;
  memory: number;
  disk: number;
};

export type CommandTemplate = {
  id: string;
  name: string;
  description: string;
  category: "system" | "network" | "storage" | "process";
  linuxCommand: string;
  windowsCommand: string;
  isSystem: boolean;
};

export type Scenario = {
  id: string;
  name: string;
  description: string;
  commands: string[];
  isSystem: boolean;
};

export type TaskLog = {
  id: string;
  agentId: string;
  type: "scenario" | "command" | "terminal";
  title: string;
  status: "success" | "error" | "running";
  createdAt: string;
  output: string;
};

export const agents: Agent[] = [
  {
    id: "ag-001",
    name: "Main Office PC",
    hostname: "office-ws-01",
    os: "Windows",
    ip: "192.168.0.21",
    status: "online",
    lastSeen: "2 sec ago",
    tags: ["Office", "Accounting"],
    cpu: 27,
    memory: 61,
    disk: 48,
  },
  {
    id: "ag-002",
    name: "Linux Node Alpha",
    hostname: "srv-alpha",
    os: "Linux",
    ip: "10.10.1.12",
    status: "busy",
    lastSeen: "just now",
    tags: ["Backend", "Prod"],
    cpu: 64,
    memory: 72,
    disk: 83,
  },
  {
    id: "ag-003",
    name: "QA Laptop",
    hostname: "qa-lab-03",
    os: "Windows",
    ip: "192.168.0.44",
    status: "offline",
    lastSeen: "14 min ago",
    tags: ["Testing"],
    cpu: 0,
    memory: 0,
    disk: 0,
  },
];

export const commandTemplates: CommandTemplate[] = [
  {
    id: "cmd-health-hostname",
    name: "Hostname",
    description: "Показывает имя машины.",
    category: "system",
    linuxCommand: "hostname",
    windowsCommand: "hostname",
    isSystem: true,
  },
  {
    id: "cmd-health-ip",
    name: "IP / network",
    description: "Проверка сетевых интерфейсов и IP адресов.",
    category: "network",
    linuxCommand: "ip a",
    windowsCommand: "ipconfig",
    isSystem: true,
  },
  {
    id: "cmd-health-disk",
    name: "Disk usage",
    description: "Проверка свободного места на диске.",
    category: "storage",
    linuxCommand: "df -h",
    windowsCommand: "wmic logicaldisk get size,freespace,caption",
    isSystem: true,
  },
  {
    id: "cmd-health-processes",
    name: "Processes",
    description: "Вывод списка активных процессов.",
    category: "process",
    linuxCommand: "ps aux | head",
    windowsCommand: "tasklist",
    isSystem: true,
  },
];

export const scenarios: Scenario[] = [
  {
    id: "scn-health-check",
    name: "Проверка жизнеспособности",
    description: "Базовый сценарий диагностики ПК: hostname, сеть, диск, процессы.",
    commands: [
      "cmd-health-hostname",
      "cmd-health-ip",
      "cmd-health-disk",
      "cmd-health-processes",
    ],
    isSystem: true,
  },
  {
    id: "scn-network-audit",
    name: "Network audit",
    description: "Быстрая проверка сети и текущих интерфейсов.",
    commands: ["cmd-health-hostname", "cmd-health-ip"],
    isSystem: false,
  },
];

export const taskLogs: TaskLog[] = [
  {
    id: "task-001",
    agentId: "ag-001",
    type: "scenario",
    title: "Проверка жизнеспособности",
    status: "success",
    createdAt: "20:12",
    output: "$ hostname\noffice-ws-01\n\n$ ipconfig\nIPv4 Address. . . . . . . . . . . : 192.168.0.21\n\n$ disk\nFree: 142 GB",
  },
  {
    id: "task-002",
    agentId: "ag-002",
    type: "terminal",
    title: "Manual command: df -h",
    status: "running",
    createdAt: "20:18",
    output: "Command sent to agent. Waiting for stdout...",
  },
  {
    id: "task-003",
    agentId: "ag-001",
    type: "command",
    title: "Disk usage",
    status: "error",
    createdAt: "20:21",
    output: "stderr: access denied to selected shell context",
  },
];
