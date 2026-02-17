---
name: doc-to-app
description: Convierte un documento (PDF/texto) en una mini-app web interactiva lista para abrir en preview. Úsalo cuando quieras pasar de “contenido” a “producto usable”.
---
# Doc-to-App (Documento a Mini-App)

## Cuándo usar esta habilidad
Cuando tengas información en un PDF, texto o notas y quieras transformarla en una mini web navegable con buscador, filtros y secciones claras, lista para enseñar o compartir.

## Inputs (si faltan, pregunta)
1) Fuente: PDF o texto pegado.
2) Tipo de app: guía, catálogo, checklist, itinerario, etc.
3) Prioridad: “más visual” o “más práctica”.
4) Idioma y estilo: claro, sencillo, sin jerga.

## Reglas importantes
- No devuelvas solo texto. Debes crear archivos y una vista previa.
- No sobrescribas nada: cada ejecución crea una carpeta nueva.
- La app debe funcionar bien en móvil.

## Estructura de salida (crear siempre)
Crea una carpeta nueva dentro del proyecto con nombre:
`miniapp_<tema>_<YYYYMMDD_HHMM>`
Dentro crea:
- `index.html` (la app)
- `data.json` (los datos estructurados extraídos del documento)
- `README.txt` (cómo abrirla y qué incluye)

## Funcionalidades mínimas de la app
1) Buscador (por texto)
2) Filtros (por categorías/etiquetas cuando tenga sentido)
3) Navegación por secciones (índice arriba o lateral)
4) Diseño limpio, legible, responsive (móvil primero)
5) Botones útiles: “copiar”, “marcar como hecho”, “expandir/contraer” si aplica

## Workflow (orden fijo)
1) Leer el documento y extraer estructura: secciones, listas, tablas, puntos clave.
2) Convertirlo a un `data.json` ordenado.
3) Generar `index.html` leyendo de `data.json` (sin frameworks).
4) Validar: que se ve bien, que busca, que filtra y que no hay contenido roto.
5) Devolver al usuario: carpeta creada + qué archivo abrir + resumen de lo que incluye.

## Output final (en chat)
Al final responde siempre con:
- “Carpeta creada: ...”
- “Abre: .../index.html”
- Resumen breve de secciones y funcionalidades
