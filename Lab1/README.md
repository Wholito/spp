# Лабораторная работа 1 — Средство автоматизации тестирования

## Структура решения

1. **TestFramework** — библиотека тестирования
2. **SampleProject** — тестируемый проект (Calculator, StringUtils)
3. **TestProject** — проект с тестами
4. **TestRunner** — программа для загрузки и выполнения тестов

## Запуск

```bash
cd "d:\spp\Lab1"
dotnet build Lab1.sln
dotnet run --project TestRunner
```

Результаты выводятся в консоль и сохраняются в `TestRunner/bin/Debug/net7.0/test-results.txt`.

## Реализованные возможности

### Атрибуты (маркеры)

- **Тестовые классы:** `[TestClass]`, `[TestClassWithName("имя")]`
- **Тестовые методы:** `[Test]`, `[TestWithDescription("описание")]`, `[TestWithParameters(...)]`
- **Контекст:** `[Setup]`, `[Teardown]`, `[ClassSetup]`, `[ClassTeardown]`

### Проверки (15 типов)

1. `Assert.AreEqual` 2. `Assert.AreNotEqual` 3. `Assert.IsTrue` 4. `Assert.IsFalse`
5. `Assert.IsNull` 6. `Assert.IsNotNull` 7. `Assert.GreaterThan` 8. `Assert.LessThan`
9. `Assert.Contains` (коллекция) 10. `Assert.DoesNotContain` 11. `Assert.Contains` (строка)
12. `Assert.Throws` 13. `Assert.ThrowsAsync` 14. `Assert.IsEmpty` 15. `Assert.IsNotEmpty`

### Обработка ошибок

- `TestFrameworkException` — базовое исключение
- `AssertionFailedException` — провал проверки (со свойствами Expected/Actual)
- `TestFailureException` — провал теста

### Контекст

- Setup — перед каждым тестом
- Teardown — после каждого теста
- ClassSetup — один раз перед всеми тестами класса
- ClassTeardown — один раз после всех тестов класса

### Асинхронность

- Поддержка `async Task` методов
- `Assert.ThrowsAsync<T>` для проверки исключений в асинхронном коде
