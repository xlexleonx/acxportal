/**
 * Контекстные подсказки для оборудования.
 * Источник: типовые задачи эксплуатации серверов/коммутаторов/СХД/UPS/firewall.
 *
 * Используется:
 *  - в диалогах запуска SSH-скриптов (подсказать команды для типа железа)
 *  - на карточках хоста (подсказать "что обычно мониторится")
 */

export type DeviceTypeKey =
  | "server" | "bmc" | "switch" | "router" | "storage" | "firewall" | "ups"
  | "vm_windows" | "vm_linux" | "backup_server" | "pdu" | "env_sensor" | "other";

export interface CommandHint {
  label: string;
  command: string;
  description: string;
}

export interface MetricHint {
  key: string;
  label: string;
  why: string;
}

export interface DeviceHints {
  title: string;
  metrics: MetricHint[];
  commands: CommandHint[];
}

const HINTS: Record<DeviceTypeKey, DeviceHints> = {
  server: {
    title: "Сервер (Linux)",
    metrics: [
      { key: "system.cpu.util", label: "Загрузка CPU", why: "Перегрузка → деградация сервисов" },
      { key: "vm.memory.utilization", label: "Использование памяти", why: "OOM, swap, утечки" },
      { key: "vfs.fs.size[/,pused]", label: "Заполнение /", why: "Падение сервисов при 100%" },
      { key: "system.uptime", label: "Uptime", why: "Незапланированные перезагрузки" },
      { key: "net.if.in/out", label: "Сетевой трафик", why: "Аномалии, DDoS, узкое место" },
    ],
    commands: [
      { label: "Проверить uptime", command: "uptime", description: "Время работы и средняя нагрузка" },
      { label: "Топ процессов CPU", command: "ps -eo pid,comm,%cpu --sort=-%cpu | head -10", description: "Кто грузит процессор" },
      { label: "Топ процессов памяти", command: "ps -eo pid,comm,%mem --sort=-%mem | head -10", description: "Утечки/перерасход памяти" },
      { label: "Свободное место", command: "df -hT", description: "Заполнение всех ФС" },
      { label: "Логи systemd (ошибки)", command: "journalctl -p err -n 50 --no-pager", description: "Последние ошибки системы" },
      { label: "Перезапуск сервиса", command: "sudo systemctl restart <service>", description: "После согласования с заказчиком" },
    ],
  },
  bmc: {
    title: "BMC / IPMI",
    metrics: [
      { key: "ipmi.temp", label: "Температуры", why: "Перегрев CPU/мат.платы" },
      { key: "ipmi.fan", label: "Скорость вентиляторов", why: "Отказ кулера" },
      { key: "ipmi.psu", label: "Состояние БП", why: "Деградация питания" },
      { key: "ipmi.voltage", label: "Напряжения", why: "Просадки, нестабильность" },
    ],
    commands: [
      { label: "Статус сенсоров", command: "ipmitool sensor list", description: "Все температуры/напряжения" },
      { label: "SEL (журнал событий)", command: "ipmitool sel elist", description: "Аппаратные события BMC" },
      { label: "Power status", command: "ipmitool chassis power status", description: "Питание шасси" },
      { label: "Firmware info", command: "ipmitool mc info", description: "Версия BMC" },
    ],
  },
  switch: {
    title: "Коммутатор",
    metrics: [
      { key: "ifOperStatus", label: "Состояние портов", why: "Линки down → сегмент сети недоступен" },
      { key: "ifInErrors/ifOutErrors", label: "Ошибки на портах", why: "Битый кабель/SFP" },
      { key: "ifHCInOctets", label: "Утилизация портов", why: "Узкое место сети" },
      { key: "system.cpu.util", label: "CPU свитча", why: "STP-петли, аномальный трафик" },
      { key: "sensor.temp.value", label: "Температура", why: "Отказ охлаждения" },
    ],
    commands: [
      { label: "Статус интерфейсов (Cisco)", command: "show interfaces status", description: "up/down, скорость, дуплекс" },
      { label: "Ошибки на портах", command: "show interfaces counters errors", description: "CRC, drops, collisions" },
      { label: "MAC-таблица", command: "show mac address-table", description: "Поиск устройства в сети" },
      { label: "VLAN", command: "show vlan brief", description: "Назначение портов по VLAN" },
      { label: "CPU/память", command: "show processes cpu | exclude 0.00", description: "Загрузка ASIC/процессора" },
    ],
  },
  router: {
    title: "Маршрутизатор",
    metrics: [
      { key: "ifOperStatus", label: "Состояние WAN/LAN портов", why: "Потеря uplink" },
      { key: "icmpping", label: "ICMP до целевых сетей", why: "Доступность маршрутов" },
      { key: "bgpPeerState", label: "BGP-сессии", why: "Падение пиринга" },
      { key: "ifHCInOctets/Out", label: "Утилизация каналов", why: "Перегрузка uplink" },
    ],
    commands: [
      { label: "Маршруты", command: "show ip route", description: "Активная таблица маршрутизации" },
      { label: "BGP Summary", command: "show ip bgp summary", description: "Состояние всех BGP-пиров" },
      { label: "Интерфейсы", command: "show ip interface brief", description: "Адресация и статус" },
      { label: "ARP", command: "show ip arp", description: "Соседи L2" },
    ],
  },
  storage: {
    title: "Система хранения",
    metrics: [
      { key: "disk.smart.health", label: "SMART дисков", why: "Предотказное состояние" },
      { key: "raid.status", label: "Статус RAID-группы", why: "Деградация массива" },
      { key: "vfs.fs.pused", label: "Заполнение пулов", why: "Остановка записи при 95%+" },
      { key: "sensor.temp", label: "Температура шасси", why: "Отказ охлаждения" },
      { key: "iops", label: "IOPS / latency", why: "Узкое место СХД" },
    ],
    commands: [
      { label: "Статус RAID (mdadm)", command: "cat /proc/mdstat", description: "Linux софт-RAID" },
      { label: "SMART всех дисков", command: "for d in /dev/sd?; do smartctl -H $d; done", description: "Health summary" },
      { label: "ZFS pool status", command: "zpool status -v", description: "ZFS-массивы и ошибки" },
      { label: "LSI MegaRAID", command: "MegaCli -LDInfo -Lall -aALL", description: "Аппаратный RAID" },
    ],
  },
  firewall: {
    title: "Межсетевой экран",
    metrics: [
      { key: "fw.session.count", label: "Активные сессии", why: "Утечка сессий, DDoS" },
      { key: "fw.cpu", label: "Загрузка CPU", why: "Деградация фильтрации" },
      { key: "ifOperStatus", label: "Статус интерфейсов", why: "Падение трансляции" },
      { key: "vpn.tunnels", label: "Состояние VPN-туннелей", why: "Падение каналов между офисами" },
    ],
    commands: [
      { label: "Активные правила", command: "iptables -L -n -v", description: "Linux iptables" },
      { label: "Сессии (conntrack)", command: "conntrack -L | wc -l", description: "Кол-во активных соединений" },
      { label: "VPN-туннели (strongSwan)", command: "ipsec statusall", description: "Состояние IPsec" },
      { label: "Логи блокировок", command: "tail -200 /var/log/iptables.log", description: "Что блокируется" },
    ],
  },
  ups: {
    title: "ИБП (UPS)",
    metrics: [
      { key: "ups.status", label: "Режим работы", why: "Сеть/батарея/байпас" },
      { key: "ups.battery.charge", label: "Заряд батареи", why: "Готовность к отключению сети" },
      { key: "ups.battery.runtime", label: "Время автономии", why: "Сколько продержится" },
      { key: "ups.load", label: "Нагрузка", why: "Перегруз → автоотключение" },
      { key: "ups.input.voltage", label: "Входное напряжение", why: "Качество питающей сети" },
    ],
    commands: [
      { label: "Статус UPS (NUT)", command: "upsc <ups-name>@localhost", description: "Все параметры через NUT" },
      { label: "APC (apcaccess)", command: "apcaccess status", description: "Для APC PowerChute" },
      { label: "Тест батареи", command: "upscmd -u admin <ups> test.battery.start.quick", description: "Только с согласия" },
    ],
  },
  vm_windows: {
    title: "Виртуальная машина (Windows)",
    metrics: [
      { key: "system.cpu.util", label: "Загрузка CPU", why: "Перегрузка → деградация сервисов" },
      { key: "vm.memory.utilization", label: "Память", why: "OOM, утечки, нехватка ОЗУ" },
      { key: "vfs.fs.size[C:,pused]", label: "Заполнение диска C:", why: "Падение сервисов при 100%" },
      { key: "system.uptime", label: "Uptime", why: "Обновления Windows требуют перезагрузки" },
    ],
    commands: [],
  },
  vm_linux: {
    title: "Виртуальная машина (Linux)",
    metrics: [
      { key: "system.cpu.util", label: "Загрузка CPU", why: "Перегрузка → деградация сервисов" },
      { key: "vm.memory.utilization", label: "Память", why: "OOM, swap, утечки" },
      { key: "vfs.fs.size[/,pused]", label: "Заполнение /", why: "Падение сервисов при 100%" },
      { key: "system.uptime", label: "Uptime", why: "Ядро/пакеты требуют перезагрузки" },
    ],
    commands: [],
  },
  backup_server: {
    title: "Сервер резервного копирования",
    metrics: [
      { key: "vfs.fs.size[/backup,pused]", label: "Заполнение хранилища", why: "Нет места → бэкапы не создаются" },
      { key: "system.cpu.util", label: "Загрузка CPU", why: "Окно бэкапа не укладывается" },
      { key: "system.uptime", label: "Uptime", why: "Незапланированные перезагрузки" },
    ],
    commands: [],
  },
  pdu: {
    title: "PDU (распределение питания)",
    metrics: [
      { key: "sensor.load", label: "Нагрузка по фазам", why: "Перекос/перегрузка → отключение стойки" },
      { key: "sensor.power", label: "Потребляемая мощность", why: "Приближение к пределу линии" },
    ],
    commands: [],
  },
  env_sensor: {
    title: "Датчик среды",
    metrics: [
      { key: "sensor.temp", label: "Температура", why: "Перегрев серверной → отказ оборудования" },
      { key: "sensor.humidity", label: "Влажность", why: "Конденсат / статика" },
    ],
    commands: [],
  },
  other: {
    title: "Прочее оборудование",
    metrics: [
      { key: "icmpping", label: "Доступность по ICMP", why: "Базовая проверка живости" },
      { key: "snmp.uptime", label: "SNMP Uptime", why: "Перезагрузки устройства" },
    ],
    commands: [
      { label: "Ping", command: "ping -c 4 <host>", description: "Доступность" },
      { label: "SNMP walk", command: "snmpwalk -v2c -c <community> <host> 1.3.6.1.2.1.1", description: "Базовая SNMP-инфо" },
    ],
  },
};

export function getDeviceHints(deviceType?: string | null): DeviceHints {
  const key = (deviceType || "other").toLowerCase() as DeviceTypeKey;
  return HINTS[key] || HINTS.other;
}

export const ALL_DEVICE_TYPES: DeviceTypeKey[] = [
  "server", "bmc", "switch", "router", "storage", "firewall", "ups",
  "vm_windows", "vm_linux", "backup_server", "pdu", "env_sensor", "other",
];