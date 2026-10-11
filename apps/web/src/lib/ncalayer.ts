/**
 * Подпись в NCALayer (НУЦ РК). NCALayer должен быть запущен на компьютере пользователя.
 * Используется модуль kz.gov.pki.knca.basics; для старых версий NCALayer — commonUtils.
 */
export function signWithNcaLayer(base64Data: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try { ws = new WebSocket("wss://127.0.0.1:13579/"); } catch { return reject(new Error("NCALayer не найден")); }
    const timeout = setTimeout(() => { ws.close(); reject(new Error("NCALayer не отвечает")); }, 120000);
    let legacy = false;
    ws.onerror = () => { clearTimeout(timeout); reject(new Error("Запустите NCALayer и обновите страницу")); };
    ws.onopen = () => {
      ws.send(JSON.stringify({
        module: "kz.gov.pki.knca.basics", method: "sign",
        args: { allowedStorages: ["PKCS12", "AKKaztokenStore", "AKKZIDCardStore", "AKEToken72KStore", "AKJaCartaStore"], format: "cms", data: base64Data,
          signingParams: { decode: true, encapsulate: false, digested: false, tsaProfile: {} }, signerParams: { extKeyUsageOids: ["1.3.6.1.5.5.7.3.2"] }, locale: "ru" },
      }));
    };
    ws.onmessage = (ev) => {
      const r = JSON.parse(ev.data);
      if (r.result?.version) return; // приветствие NCALayer
      if (r.status === true) { clearTimeout(timeout); ws.close(); return resolve(Array.isArray(r.body?.result) ? r.body.result[0] : r.body?.result); }
      if (r.code === "200" && r.responseObject) { clearTimeout(timeout); ws.close(); return resolve(r.responseObject); }
      if (!legacy && (r.code === "500" || r.status === false) && /module|method/i.test(JSON.stringify(r))) {
        legacy = true;
        ws.send(JSON.stringify({ module: "kz.gov.pki.knca.commonUtils", method: "createCMSSignatureFromBase64", args: ["PKCS12", "AUTHENTICATION", base64Data, false] }));
        return;
      }
      clearTimeout(timeout); ws.close();
      reject(new Error(r.message || r.body?.message || "Подпись отменена"));
    };
  });
}
