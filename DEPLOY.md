# Publicar NutriFoto con HTTPS

## Opcion recomendada: Vercel

1. Crea o usa una cuenta en Vercel.
2. En la carpeta del proyecto ejecuta:

```powershell
npx vercel
```

3. Cuando Vercel pregunte, acepta la configuracion por defecto.
4. Para publicar la version final:

```powershell
npx vercel --prod
```

5. En Vercel, agrega la variable de entorno `OPENAI_API_KEY` si quieres analisis visual real.

Sin `OPENAI_API_KEY`, la app sigue funcionando en modo guiado por notas.

## Uso en el telefono

Abre la URL `https://...vercel.app` en el navegador del telefono. Desde el menu del navegador puedes usar "Agregar a pantalla de inicio" o "Instalar app".
