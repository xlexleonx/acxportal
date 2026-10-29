// Single source of truth for notification event types
export type NotificationEventDef = {
  key: string;
  label: string;
  description: string;
  defaultPriority?: "P1" | "P2" | "P3" | "P4" | "info";
  module: "tickets" | "protocols" | "monitoring" | "documents" | "users" | "automation" | "schedules" | "chat";
  audience: ("admin" | "engineer" | "customer")[]; // who typically cares
};

export const NOTIFICATION_EVENTS: NotificationEventDef[
] = [
  // Tickets
  { key: "ticket.created", label: "Новая заявка", description: "Создана новая заявка в системе", module: "tickets", audience: ["admin", "engineer"] },
  { key: "ticket.assigned", label: "Заявка назначена на меня", description: "Заявка назначена на текущего пользователя", module: "tickets", audience: ["engineer"] },
  { key: "ticket.status_changed", label: "Изменение статуса заявки", description: "Любая смена статуса заявки", module: "tickets", audience: ["admin", "engineer", "customer"] },
  { key: "ticket.comment_added", label: "Новый комментарий в заявке", description: "Добавлен публичный комментарий", module: "tickets", audience: ["admin", "engineer", "customer"] },
  { key: "ticket.comment_internal", label: "Внутренний комментарий", description: "Только для инженеров и админов", module: "tickets", audience: ["admin", "engineer"] },
  { key: "ticket.sla_warning", label: "Предупреждение SLA", description: "Осталось < 25% времени до дедлайна SLA", module: "tickets", audience: ["admin", "engineer"] },
  { key: "ticket.sla_breached", label: "Просрочка SLA", description: "SLA нарушен", module: "tickets", audience: ["admin", "engineer", "customer"] },
  { key: "ticket.resolved", label: "Заявка решена", description: "Статус «Решена»", module: "tickets", audience: ["customer"] },
  { key: "ticket.closed", label: "Заявка закрыта", description: "Окончательное закрытие", module: "tickets", audience: ["admin", "engineer", "customer"] },

  // Protocols
  { key: "protocol.created", label: "Создан протокол ТО", description: "Сгенерирован новый протокол обслуживания", module: "protocols", audience: ["admin", "engineer"] },
  { key: "protocol.overdue", label: "Просрочен протокол", description: "Протокол не закрыт в срок", module: "protocols", audience: ["admin", "engineer"] },
  { key: "protocol.completed", label: "Протокол завершён", description: "Все пункты протокола выполнены", module: "protocols", audience: ["admin", "engineer", "customer"] },

  // Schedules
  { key: "schedule.upcoming", label: "Приближается ТО", description: "Запланированное обслуживание в течение 3 дней", module: "schedules", audience: ["engineer"] },

  // Monitoring
  { key: "monitoring.problem_critical", label: "Критическая проблема (Zabbix)", description: "Severity Disaster/High из мониторинга", defaultPriority: "P1", module: "monitoring", audience: ["admin", "engineer"] },
  { key: "monitoring.problem_warning", label: "Предупреждение (Zabbix)", description: "Severity Average/Warning", defaultPriority: "P3", module: "monitoring", audience: ["admin", "engineer"] },
  { key: "monitoring.problem_resolved", label: "Проблема устранена (Zabbix)", description: "Триггер восстановлен", module: "monitoring", audience: ["admin", "engineer"] },
  { key: "monitoring.host_unreachable", label: "Хост недоступен", description: "Потеря связи с устройством", defaultPriority: "P2", module: "monitoring", audience: ["admin", "engineer"] },
  { key: "monitoring.threshold_exceeded", label: "Превышен порог", description: "Срабатывание пользовательских порогов", module: "monitoring", audience: ["admin", "engineer"] },

  // Automation
  { key: "automation.completed", label: "Автоматизация завершена", description: "Ansible-скрипт успешно выполнен", module: "automation", audience: ["admin", "engineer"] },
  { key: "automation.failed", label: "Ошибка автоматизации", description: "Сбой Ansible-сценария", defaultPriority: "P2", module: "automation", audience: ["admin", "engineer"] },

  // Documents
  { key: "document.uploaded", label: "Загружен документ", description: "Новый документ в библиотеке", module: "documents", audience: ["admin", "engineer", "customer"] },

  // Users
  { key: "user.created", label: "Создан новый пользователь", description: "Регистрация нового аккаунта", module: "users", audience: ["admin"] },
  { key: "user.role_changed", label: "Изменены роли пользователя", description: "Назначены/сняты роли", module: "users", audience: ["admin"] },

  // Chat
  { key: "chat.message_new", label: "Новое сообщение в чате", description: "Кто-то написал в треде, где я участник", module: "chat", audience: ["admin", "engineer", "customer"] },
  { key: "agent.registered", label: "Подключение нового AP агента", description: "На портале зарегистрировался новый агент мониторинга", module: "monitoring", audience: ["admin", "engineer"] },
  { key: "agent.usb_connected", label: "Подключение съёмного носителя (USB)", description: "К агенту подключена флешка, внешний диск или телефон/MTP", module: "monitoring", audience: ["admin", "engineer"] },
  { key: "agent.hw_replaced", label: "Замена компонента оборудования", description: "Изменился состав железа: диск, память, плата и т.п.", module: "monitoring", audience: ["admin", "engineer"] },
];

export const EVENT_MODULES: Record<string, string> = {
  tickets: "Заявки",
  protocols: "Протоколы",
  schedules: "Календарь ТО",
  monitoring: "Мониторинг",
  automation: "Автоматизация",
  documents: "Документы",
  users: "Пользователи",
  chat: "Чат",
};

export const PRIORITY_OPTIONS = [
  { value: "info", label: "Любой" },
  { value: "P4", label: "P4 — низкий и выше" },
  { value: "P3", label: "P3 — обычный и выше" },
  { value: "P2", label: "P2 — высокий и выше" },
  { value: "P1", label: "P1 — критический" },
];

export const WEEKDAYS = [
  { value: 1, label: "ПН" },
  { value: 2, label: "ВТ" },
  { value: 3, label: "СР" },
  { value: 4, label: "ЧТ" },
  { value: 5, label: "ПТ" },
  { value: 6, label: "СБ" },
  { value: 0, label: "ВС" },
];
