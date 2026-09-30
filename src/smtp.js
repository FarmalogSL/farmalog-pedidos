import { connect } from "cloudflare:sockets";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function smtpReader(socket) {
  const reader = socket.readable.getReader();
  let buf = "";
  return async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error("SMTP cerró la conexión");
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\r\n");
      if (lines.length < 2) continue;
      let used=0, out=[];
      for (const line of lines.slice(0,-1)) {
        used += line.length+2; out.push(line);
        if (/^\d{3} /.test(line)) { buf=buf.slice(used); return out.join("\n"); }
      }
    }
  };
}
function expect(resp, codes){ const n=Number(resp.slice(0,3)); if(!codes.includes(n)) throw new Error(`SMTP ${resp}`); }
async function write(writer, s){ await writer.write(enc.encode(s+"\r\n")); }
function b64(s){ return btoa(unescape(encodeURIComponent(s))); }
function cleanHeader(s){ return String(s??"").replace(/[\r\n]+/g," ").trim(); }
function attachmentPart(a,boundary){
  const bytes=Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0)); let bin="";
  for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
  const body=btoa(bin).match(/.{1,76}/g)?.join("\r\n")||"";
  return `--${boundary}\r\nContent-Type: ${cleanHeader(a.contentType||"application/octet-stream")}; name="${cleanHeader(a.filename)}"\r\nContent-Disposition: attachment; filename="${cleanHeader(a.filename)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}\r\n`;
}
function message({from,to,subject,text,attachments=[]}){
  const boundary=`farmalog_${crypto.randomUUID().replaceAll("-","")}`;
  let body=`From: ${cleanHeader(from)}\r\nTo: ${cleanHeader(to)}\r\nSubject: ${cleanHeader(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${String(text||"").replace(/\r?\n/g,"\r\n")}\r\n`;
  for(const a of attachments) body+=attachmentPart(a,boundary);
  return body+`--${boundary}--\r\n`;
}
export async function sendSMTP({user,password,to,subject,text,attachments=[]}){
  if(!user||!password) throw new Error("Faltan SMTP_USER/SMTP_PASSWORD");
  const addr={hostname:"send.one.com",port:587};
  let socket=connect(addr,{secureTransport:"starttls",allowHalfOpen:true});
  let read=await smtpReader(socket), writer=socket.writable.getWriter();
  expect(await read(),[220]); await write(writer,"EHLO farmalog.es"); expect(await read(),[250]);
  await write(writer,"STARTTLS"); expect(await read(),[220]); writer.releaseLock();
  socket=socket.startTls(); read=await smtpReader(socket); writer=socket.writable.getWriter();
  await write(writer,"EHLO farmalog.es"); expect(await read(),[250]);
  await write(writer,"AUTH LOGIN"); expect(await read(),[334]); await write(writer,b64(user)); expect(await read(),[334]); await write(writer,b64(password)); expect(await read(),[235]);
  await write(writer,`MAIL FROM:<${user}>`); expect(await read(),[250]); await write(writer,`RCPT TO:<${to}>`); expect(await read(),[250,251]); await write(writer,"DATA"); expect(await read(),[354]);
  const data=message({from:user,to,subject,text,attachments}).replace(/\r\n\./g,"\r\n..");
  await write(writer,data+"\r\n."); expect(await read(),[250]); await write(writer,"QUIT");
  await writer.close(); return {ok:true};
}
