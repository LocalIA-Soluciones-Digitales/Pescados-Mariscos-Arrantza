// Apps Script de soporte.localia@gmail.com: cada 5 minutos recoge los
// correos con factura o albarán que reenvía David y manda cada adjunto a la
// web (Edge Function compras-correo). Al terminar le pone la etiqueta
// «Arrantza-recogido» al correo, para no volver a mandarlo.
//
// Instalación (una vez):
//   1. script.google.com con la cuenta soporte.localia@gmail.com → Nuevo proyecto.
//   2. Pegar este archivo y cambiar CLAVE por el valor de COMPRAS_CORREO_SECRET.
//   3. Ejecutar «instalar» y aceptar los permisos (leer Gmail y conectar
//      con servicios externos). Crea el disparador de cada 5 minutos.
// Para recoger ya, sin esperar: ejecutar «recoger».

const URL_WEB = 'https://ukhfaphloxlszomccgde.supabase.co/functions/v1/compras-correo';
const CLAVE = 'PEGAR_AQUI_LA_CLAVE';
const ETIQUETA = 'Arrantza-recogido';
// Qué correos se recogen: lo que reenvía David (y, si algún día lo mandan
// directamente aquí, los proveedores). Solo con adjunto y de los últimos días.
const BUSQUEDA = 'from:(d-tamayo@hotmail.com) has:attachment newer_than:14d -label:' + ETIQUETA;
const TIPOS = /\.(pdf|jpe?g|png|webp)$/i;

function recoger() {
  const etiqueta = GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
  const hilos = GmailApp.search(BUSQUEDA, 0, 20);
  for (const hilo of hilos) {
    let todoBien = true;
    for (const msg of hilo.getMessages()) {
      const adjuntos = msg.getAttachments({ includeInlineImages: false });
      adjuntos.forEach((adj, i) => {
        if (!TIPOS.test(adj.getName()) && adj.getContentType() !== 'application/pdf') return;
        const res = UrlFetchApp.fetch(URL_WEB, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-webhook-secret': CLAVE },
          muteHttpExceptions: true,
          payload: JSON.stringify({
            mensaje_id: msg.getId(),
            adjunto: i,
            nombre: adj.getName(),
            tipo_mime: adj.getContentType(),
            datos: Utilities.base64Encode(adj.getBytes()),
            remitente: msg.getFrom(),
            asunto: msg.getSubject(),
            recibido: msg.getDate().toISOString(),
            cuerpo: msg.getPlainBody().slice(0, 3000),
          }),
        });
        if (res.getResponseCode() !== 200) {
          todoBien = false;
          console.error(msg.getSubject() + ' / ' + adj.getName() + ': ' + res.getResponseCode() + ' ' + res.getContentText());
        }
      });
    }
    // Si algo falló, se reintenta en la siguiente vuelta (la web no duplica).
    if (todoBien) hilo.addLabel(etiqueta);
  }
}

function instalar() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'recoger') ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger('recoger').timeBased().everyMinutes(5).create();
  recoger();
}
