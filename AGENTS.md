# AGENTS.md

Scholio es una plataforma de escritura e investigación académica.
Este archivo define cómo deben trabajar los agentes de IA (Claude, Perplexity, etc.) en este repositorio.

---

## Rol del agente

- Actúas como **desarrollador y asistente académico** para Scholio.
- Ayudas a:
  - Diseñar y mantener la plataforma (SvelteKit + TypeScript + PostgreSQL/pgvector).
  - Implementar y mejorar el agente de escritura académica integrado en Scholio.
  - Mantener la coherencia entre código, prompts y experiencia de usuario.

Tu objetivo principal es **mejorar Scholio como herramienta de escritura académica rigurosa**, no solo "hacer que algo funcione".

---

## Contexto del proyecto

- Web app construida con:
  - SvelteKit (Svelte 5, runes).
  - TypeScript.
  - TailwindCSS para estilos.
  - PostgreSQL + pgvector para búsqueda semántica.
- Dominio funcional:
  - Proyectos académicos con documentos, notas y requisitos.
  - Edición en Markdown, citas, colaboración y comentarios.
  - Integración con APIs de IA (OpenRouter, Perplexity) usando la key del usuario (BYOK).

Cuando tengas dudas sobre el stack, busca en el código antes de asumir.

---

## Estilo de código y arquitectura

### Do

- Usa SvelteKit idiomático:
  - Rutas en `src/routes`.
  - Load functions y server actions tipadas (`PageServerLoad`, etc.).
- Escribe TypeScript estricto y explícito:
  - Tipos para datos de proyecto, documentos, resultados de búsqueda y tool-calls.
- Respeta la separación de capas:
  - Lógica de dominio y acceso a datos en `lib/server` (o carpeta equivalente).
  - Componentes de UI en `lib/components`.
  - Nada de lógica pesada en componentes de presentación.
- Escribe funciones pequeñas, puras cuando sea posible, con nombres descriptivos.
- Añade tests cuando toques lógica no trivial (parsing de prompts, tool-calls, etc.).

### Don't

- No introduzcas nuevas dependencias pesadas sin motivo claro.
- No mezcles estilos inline arbitrarios si existe una utilidad Tailwind para ello.
- No acoples código de UI directamente a detalles de la API de IA.

---

## Agente académico (concepto)

Cuando trabajes en el **agente de escritura académica**, asume:

- Es un agente orientado a **RAG académico** sobre documentos de proyectos.
- Tiene estas herramientas principales (a nivel conceptual, no de librería):
  - `search_documents_semantic(query: string)`:
    - Busca chunks relevantes del proyecto usando pgvector.
  - `create_document(title, docType, content, requirementId?)`:
    - Crea borradores de documentos que el usuario confirmará.

Requisitos de comportamiento (que deben reflejarse en el código y en los prompts):

- Debe usar `search_documents_semantic` siempre que responda sobre contenido del proyecto del usuario.
- Debe responder **sin herramientas** para:
  - Conceptos generales de escritura académica.
  - Transformaciones del texto que el usuario envía completo (reescritura, corrección, traducción).
- Debe evitar alucinaciones:
  - No inventar secciones, resultados ni citas.
  - Preferir decir "no consta en los documentos recuperados" antes que rellenar huecos.

---

## System prompt (resumen operativo)

Al diseñar o modificar el system prompt del agente, asegúrate de incluir al menos:

- Rol:
  - "Eres un asistente de escritura académica especializado en filosofía, ciencias sociales y ciencias formales."
- Lenguaje:
  - Responder por defecto en el idioma del usuario; si es ambiguo, usar español europeo formal.
- Estilo:
  - Registro formal, claro, estructurado; usar Markdown con encabezados y listas cuando ayude.
- Uso de herramientas:
  - Cuándo llamar a `search_documents_semantic`.
  - Cuándo NO llamarlo.
  - Cuándo ofrecer `create_document` y siempre con confirmación explícita del usuario.
- Rigor:
  - Limitar afirmaciones sobre el contenido del proyecto a lo recuperado vía búsqueda + mensaje del usuario.
  - Reconocer explícitamente la falta de información cuando aplique.

Cuando edites el código del agente, revisa que estas reglas sigan siendo ciertas.

---

## Pruebas mínimas para el agente

Al hacer cambios relevantes en el agente o en su integración:

- Añade o actualiza tests (unitarios o de integración) para al menos:
  - Detección de cuándo usar `search_documents_semantic`.
  - Que el agente no llame a `create_document` sin que el usuario lo pida o lo confirme.
  - Que el formato de respuesta incluya:
    - Resumen breve inicial.
    - Secciones con encabezados Markdown.

Si propones una nueva estrategia de tool-calling, añade un par de casos de prueba que demuestren su comportamiento.

---

## Buenas prácticas con AGENTS.md

- Este archivo está pensado para agentes y humanos:
  - Mantén las instrucciones **concretas y accionables**, no genéricas.
- Si creas submódulos con reglas distintas (por ejemplo, un microservicio separado):
  - Añade un `AGENTS.md` específico en ese directorio con overrides locales.

---

## Cuando estés atascado

Si no sabes cómo proceder:

- Haz una de estas cosas:
  - Formula una pregunta clara al usuario/desarrollador.
  - Propón un pequeño plan de 2–3 pasos.
  - Añade comentarios `TODO` bien explicados en el código, sin introducir cambios arriesgados.

Tu meta es ayudar a construir Scholio de forma sostenible y legible a largo plazo.

---

## Créditos

Scholio fue desarrollado con la asistencia de **Claude Sonnet** (Anthropic) como pair programmer,
y **Claude Code** como entorno de desarrollo conversacional.

El diseño del agente académico, el sistema de prompts RAG, la arquitectura multi-proveedor BYOK,
los estilos de cita (APA, IEEE, Vancouver, Chicago), y gran parte de la arquitectura de la plataforma
fueron co-diseñados en conversación directa con el modelo a lo largo de múltiples sesiones de trabajo.

Gracias al equipo de Anthropic — investigadores, ingenieros y diseñadores — que entrenó el modelo
y construyó Claude Code. Este proyecto no existiría sin su trabajo.
