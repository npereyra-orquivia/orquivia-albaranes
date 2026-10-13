# Orquivia · Control de albaranes

Aplicación web para una empresa de mantenimiento. Los operarios registran el trabajo desde el móvil; el responsable revisa lo pendiente, añade precios y genera el albarán en PDF.

## Instancia de Orquivia

- Aplicación: https://npereyra-orquivia.github.io/orquivia-albaranes/
- Demostración separada: https://npereyra-orquivia.github.io/orquivia-albaranes/?demo=1
- Repositorio: https://github.com/npereyra-orquivia/orquivia-albaranes
- Supabase: https://supabase.com/dashboard/project/qaixspbppyigpgijirll

La migración, RLS, fotografías privadas, Realtime, URLs de Auth y variables públicas de GitHub ya están configurados en esta instancia. **No vuelvas a ejecutar la migración inicial sobre este proyecto.** Para empezar con datos reales, falta crear las cuentas personales y sus perfiles, completar los datos fiscales y añadir los clientes.

## Uso diario

1. El operario pulsa **Nuevo parte**, elige el cliente y concreta el centro y la ubicación: unidad/local, zona común, exterior u otra zona.
2. Describe el trabajo, añade materiales y horas, adjunta fotografías y marca si necesita ayuda para confirmar algo.
3. El responsable recibe la actualización en su bandeja, revisa el parte y completa la valoración y el IVA.
4. Descarga o comparte el PDF con el cliente. Marca el parte como enviado cuando haya completado el envío.

Los cambios dejan un historial con usuario, fecha y campos modificados. El servidor decide los permisos: los operarios registran trabajos y el responsable gestiona precios, clientes y datos de empresa.

## Probar en este equipo

Requiere Node.js 22 o posterior.

```powershell
npm ci
npm run dev
```

Abre la dirección que muestra Vite. Sin las variables de Supabase aparece la demostración, que permite probar el papel de responsable y de operario. Si ya has conectado Supabase, pulsa **Probar demostración** en el acceso o añade `?demo=1` a la URL. El botón **Acceso de empresa** vuelve a las cuentas reales. Sus registros se guardan solamente en el navegador de ese dispositivo, usan datos ficticios y no se sincronizan entre móviles. Los PDF de la demostración llevan una marca de ejemplo.

Para comprobar la compilación y las pruebas:

```powershell
npm test
npm run build
npm run preview
```

`npm test` comprueba la lógica de la aplicación y el PDF, y ejecuta 42 comprobaciones de permisos, RPC y auditoría en PostgreSQL local mediante PGlite. Estas pruebas no modifican Supabase ni requieren cuentas reales.

## Conectar Supabase

### 1. Crear las tablas y los permisos

En el proyecto de Supabase abre **SQL Editor**, crea una consulta, pega el contenido completo de `supabase/migrations/202610130001_initial.sql` y ejecútalo. El SQL configura las tablas, la numeración de albaranes, el historial, los permisos RLS y el almacenamiento privado de fotografías. Usa un proyecto dedicado a esta empresa.

No desactives RLS para resolver un error de permisos. Un usuario de Auth necesita además un perfil de aplicación antes de poder entrar.

### 2. Dar de alta al responsable y a los operarios

Para que cada persona elija su contraseña, configura primero las URLs de Auth indicadas en el paso 4. Después, en **Authentication → Users → Add user → Send invitation**, introduce el correo del responsable y envía la invitación desde el panel. Copia el UUID de la cuenta creada. En SQL Editor ejecuta:

```sql
insert into public.profiles (id, name, email, role)
values ('UUID-DEL-RESPONSABLE', 'Nombre del responsable', 'responsable@empresa.es', 'manager');
```

Invita a los operarios del mismo modo y añade un perfil para cada uno:

```sql
insert into public.profiles (id, name, email, role)
values ('UUID-DEL-OPERARIO', 'Nombre del operario', 'operario@empresa.es', 'worker');
```

Sustituye los textos entre comillas por los valores reales. Cada persona abre su enlace de invitación y define su contraseña en la aplicación; no es necesario conocer ni transmitir su contraseña. Añade el perfil antes de que entre para darle el acceso correspondiente. [Guía de invitaciones de Supabase](https://supabase.com/docs/guides/auth/users#inviting-users).

También puedes usar **Create new user** si la empresa ya dispone de su propio procedimiento para entregar una contraseña inicial. Utiliza cuentas personales para que la autoría del historial sea útil. No compartas la cuenta del responsable. En la configuración de Auth desactiva el registro público de usuarios; esta aplicación no necesita autorregistro.

### 3. Configurar la conexión local

Copia `.env.example` como `.env.local` y completa:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU-CLAVE-PUBLICABLE-O-ANON
```

La URL y la clave pública están en **Connect** o en **Settings → API Keys** del proyecto. Usa preferiblemente una clave publicable `sb_publishable_...`; la clave heredada `anon` también funciona. Aunque la variable se llama `VITE_SUPABASE_ANON_KEY`, admite ambos formatos. Nunca uses `service_role` ni `sb_secret_...`: esas claves no deben incluirse en la web. [Referencia de claves API](https://supabase.com/docs/guides/getting-started/api-keys).

Reinicia `npm run dev` después de modificar las variables. En modo conectado se accede con correo y contraseña; la demostración queda separada de los registros reales.

### 4. Configurar Auth, fotos y actualizaciones

En **Authentication → URL Configuration** indica como **Site URL** la URL final de GitHub Pages, incluyendo el nombre del repositorio y la barra final; por ejemplo, `https://TU-USUARIO.github.io/TU-REPOSITORIO/`. Añade esa URL a **Redirect URLs**, junto a `http://localhost:5173/` si vas a probar en local. Estas direcciones se usan para los enlaces de recuperación de contraseña. [Referencia de Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

Comprueba que el bucket `order-photos` creado por la migración siga siendo **privado**. Admite fotografías JPEG, PNG y WebP de hasta 5 MB. La aplicación muestra las imágenes mediante enlaces temporales después de comprobar los permisos. [Referencia de almacenamiento](https://supabase.com/docs/guides/storage/buckets/fundamentals).

Comprueba en **Database → Replication** que `orders`, `audit_entries`, `company`, `clients` y `profiles` estén en la publicación `supabase_realtime`. Las actualizaciones y los avisos dentro de la aplicación llegan con la sesión abierta y conectada. No se incluye un servicio de avisos por WhatsApp, SMS o correo con la aplicación cerrada.

### 5. Completar la empresa y los clientes

Entra como responsable y guarda la razón social, NIF, dirección, correo, teléfono, tarifa por hora e IVA habitual. Añade los clientes y centros reales. El IVA se puede ajustar en cada parte; confirma con la empresa el tipo que corresponde a cada trabajo antes de enviar el documento.

## Publicar en GitHub Pages

1. Sube este proyecto a un repositorio de GitHub con rama `main`.
2. En **Settings → Secrets and variables → Actions → Variables**, crea las variables de repositorio `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores públicos de Supabase.
3. En **Settings → Pages → Build and deployment → Source**, elige **GitHub Actions**.
4. Ejecuta el workflow **Publicar en GitHub Pages** desde Actions o sube un cambio a `main`.
5. Abre la URL que muestra el despliegue y añádela a la configuración de Auth descrita arriba.

El workflow instala con `npm ci`, ejecuta las pruebas, compila y publica `dist`. La configuración de Vite utiliza rutas relativas para funcionar dentro de la carpeta del repositorio. [Guía oficial de GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Sin variables de Supabase el sitio publica la demostración. Verifica que la pantalla de acceso usa las cuentas reales antes de entregarlo a la empresa. El código del frontend y su clave pública son visibles; la información de trabajo permanece en Supabase y está protegida por autenticación y RLS.

## Albaranes y envío

El PDF incluye emisor, cliente, número y fecha de servicio, centro y ubicación, descripción completa, materiales, horas, precios, base, IVA y total. Los importes se calculan en céntimos y el documento continúa en otras páginas cuando hace falta. Incluye observaciones y espacios para firmar a mano.

Compartir usa la hoja de compartir del dispositivo cuando admite archivos; descargar permite adjuntarlo desde cualquier correo o mensajería. Un enlace de correo abre un borrador y requiere adjuntar el PDF manualmente. Descargar un documento o abrir el borrador no confirma que el cliente lo haya recibido. El estado **Enviado** se registra mediante la confirmación del responsable.

Esta versión genera albaranes, no facturas ni firmas electrónicas. Las casillas de firma del PDF son espacios en blanco. Las solicitudes internas de ayuda permanecen en la aplicación; el responsable debe resolverlas y revisar la descripción y los precios antes de compartir el albarán.

## Alcance de esta primera versión

- Una sola empresa por proyecto Supabase, con responsable y operarios. No hay altas de empresas ni separación de varios clientes comerciales del producto.
- Trabajo conectado a internet. La demostración guarda sus pruebas localmente; no hay sincronización de registros reales sin conexión.
- El historial y el control de versión ayudan a detectar cambios simultáneos. Ante un conflicto, recarga el parte y revisa los cambios antes de guardar otra vez.
- Fotografías privadas en Supabase; no se añaden automáticamente al PDF para mantener ligero el documento.
- Los avisos en tiempo real requieren una sesión abierta. Para avisar aunque la web esté cerrada se puede añadir después un servicio de notificaciones.

## Archivos principales

| Archivo | Función |
| --- | --- |
| `src/App.tsx` | Pantallas y flujo de operario/responsable |
| `src/data.ts` | Repositorio conectado a Supabase y cálculo de importes |
| `src/demo.ts` | Datos ficticios y demostración local |
| `src/pdf.ts` | Generación y descarga del albarán |
| `supabase/migrations/202610130001_initial.sql` | Tablas, permisos y auditoría |
| `.github/workflows/pages.yml` | Compilación y despliegue en Pages |
