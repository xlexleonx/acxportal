#!/usr/bin/env python3
# Добавляет тарифные пресеты модулей и кнопки-пресеты в EditUserDialog.tsx.
import sys
p = "/home/appadmin/repo/src/components/users/EditUserDialog.tsx"
s = open(p, encoding="utf-8").read()

if "MODULE_PRESETS" in s:
    print("уже пропатчен — выход")
    sys.exit()

# 1. константа пресетов после MODULES
anchor1 = "const MODULES = NON_ADMIN_MODULES;"
presets = anchor1 + """

// Тарифные пресеты доступа к модулям. Стартовая точка — оператор может дотюнить галочками.
const MODULE_PRESETS: { label: string; keys: string[] }[] = [
  { label: "Демо",        keys: ["dashboard", "equipment", "monitoring", "tickets", "help"] },
  { label: "Базовая",     keys: ["dashboard", "tickets", "notifications", "equipment", "monitoring", "help"] },
  { label: "Расширенная", keys: ["dashboard", "tickets", "notifications", "equipment", "monitoring", "help", "documents", "schedules", "protocols"] },
];"""
assert s.count(anchor1) == 1, "anchor1 не уникален"
s = s.replace(anchor1, presets)

# 2. ряд кнопок над сеткой модулей
anchor2 = '              <p className="text-xs text-muted-foreground">Отметьте модули, к которым пользователь будет иметь доступ</p>'
buttons = anchor2 + """
              <div className="flex flex-wrap gap-2 pb-1">
                {MODULE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs"
                    onClick={() => setEditModules(preset.keys)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>"""
assert s.count(anchor2) == 1, "anchor2 не уникален"
s = s.replace(anchor2, buttons)

open(p, "w", encoding="utf-8").write(s)
print("EditUserDialog.tsx: пресеты и кнопки добавлены")
