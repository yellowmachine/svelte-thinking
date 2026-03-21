---
name: Patrón para componentes con trpc en Storybook
description: Cuando un componente llama a trpc internamente, preferir "lift side effects to props" para que Storybook pueda pasarle fn() dummies funcionales
type: feedback
---

Cuando un componente llama a trpc directamente (mutate/query), la interacción no funciona en Storybook porque no hay servidor real. El patrón preferido es **"lift side effects to props"**: el componente acepta los callbacks como props y delega la lógica al padre, que en Storybook pasa `fn()` de `storybook/test`.

**Why:** Hace el componente testeable sin mocks de red, más reutilizable, y el story refleja el comportamiento real incluyendo interacciones.

**How to apply:** Al refactorizar componentes con trpc, mover las llamadas al padre y exponer props como `onresolve`, `onreply`, `onsave`, etc. El componente sigue controlando estado interno (loading, error display). Solo aplicar cuando el componente tiene valor de reutilización o testing — si es muy específico del dominio está bien dejar trpc directo y el story solo cubre el visual.
