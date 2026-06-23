export const dynamic = "force-dynamic";

import { AppointmentStatus, UserRole, WhatsAppStatus } from "@prisma/client";
import {
  cancelAppointmentAction,
  createCustomerNoteAction,
  createManualAppointmentAction,
  createTenantAction,
  updateTenantSettingsAction,
  updateWorkingHoursAction,
  upsertServiceAction,
  upsertStaffAction,
  requestPairingCodeAction
} from "@/app/dashboard/actions";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney, minuteToLabel, weekdayName } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { 
  Calendar as CalendarIcon, 
  Users as UsersIcon, 
  Settings as SettingsIcon,
  PhoneCall,
  MessageCircle,
  Mic,
  PlusCircle,
  Trash2,
  QrCode,
  Smartphone
} from "lucide-react";

function statusPill(status?: WhatsAppStatus) {
  if (status === WhatsAppStatus.CONNECTED) return <span className="pill ok">Bağlı</span>;
  if (status === WhatsAppStatus.QR_READY || status === WhatsAppStatus.AUTHENTICATED) return <span className="pill warn">Bekleniyor</span>;
  if (status === WhatsAppStatus.FAILED) return <span className="pill danger">Hata</span>;
  return <span className="pill">Bağlı değil</span>;
}

function datetimeLocalValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

async function OwnerDashboard({ notice, error }: { notice?: string; error?: string }) {
  const tenants = await prisma.tenant.findMany({
    include: {
      whatsappSession: true,
      users: { where: { role: UserRole.TENANT_ADMIN }, take: 1 },
      _count: { select: { appointments: true, customers: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <h1>Sistem Sahibi</h1>
          <p>Yönetim Paneli</p>
        </div>
        <form action="/api/logout" method="post">
          <button className="btn secondary" type="submit" style={{ padding: '8px 16px', width: 'auto' }}>Çıkış</button>
        </form>
      </header>
      <div className="container stack">
        {notice ? <p className="pill ok mb-4">{notice}</p> : null}
        {error ? <p className="pill danger mb-4">{error}</p> : null}

        <section className="card">
          <h2 className="card-title">Yeni İşletme Daveti</h2>
          <form action={createTenantAction} className="stack">
            <div className="form-group"><label>İşletme adı</label><input className="input-field" name="name" required /></div>
            <div className="form-group"><label>Slug</label><input className="input-field" name="slug" /></div>
            <div className="form-group"><label>Telefon</label><input className="input-field" name="phone" /></div>
            <div className="form-group"><label>Adres</label><input className="input-field" name="address" /></div>
            <div className="form-group"><label>Admin email</label><input className="input-field" name="email" type="email" required /></div>
            <div className="form-group"><label>Admin şifre</label><input className="input-field" name="password" type="password" minLength={8} required /></div>
            <button className="btn mt-4" type="submit">İşletme oluştur</button>
          </form>
        </section>

        <section className="card">
          <h2 className="card-title">İşletmeler</h2>
          <div className="stack">
            {tenants.map((t) => (
              <div key={t.id} className="customer-item" style={{ padding: 0 }}>
                <div className="customer-info">
                  <h4>{t.name}</h4>
                  <p>{t.slug} • {t.users[0]?.email}</p>
                </div>
                <div>{statusPill(t.whatsappSession?.status)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

async function TenantDashboard({ tenantId, notice, error }: { tenantId: string; notice?: string; error?: string }) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: {
      whatsappSession: true,
      services: { orderBy: [{ active: "desc" }, { name: "asc" }] },
      staff: {
        include: { workingHours: { orderBy: { weekday: "asc" } } },
        orderBy: [{ active: "desc" }, { name: "asc" }]
      },
      appointments: {
        where: { startAt: { gte: new Date(new Date().setHours(0,0,0,0)), lte: new Date(new Date().setHours(23,59,59,999)) } },
        include: { service: true, staff: true, customer: true },
        orderBy: { startAt: "asc" }
      },
      customers: {
        include: {
          notes: { orderBy: { createdAt: "desc" }, take: 3 },
          appointments: { include: { service: true }, orderBy: { startAt: "desc" }, take: 1 }
        },
        orderBy: { updatedAt: "desc" },
        take: 50
      }
    }
  });

  const activeServices = tenant.services.filter(s => s.active);
  const activeStaff = tenant.staff.filter(s => s.active);

  // Group today's appointments by hour (09:00 - 19:00)
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <h1>{tenant.name}</h1>
          <p>DoluKoltuk Paneli</p>
        </div>
        <form action="/api/logout" method="post">
          <button className="btn secondary" type="submit" style={{ padding: '8px 16px', width: 'auto' }}>Çıkış</button>
        </form>
      </header>

      <div className="container" style={{ paddingBottom: '100px' }}>
        {notice ? <p className="pill ok mb-4" style={{ display: 'block', textAlign: 'center' }}>{notice}</p> : null}
        {error ? <p className="pill danger mb-4" style={{ display: 'block', textAlign: 'center' }}>{error}</p> : null}

        {/* TAB: CALENDAR */}
        <div id="tab-calendar" className="tab-content active">
          <section className="card">
            <h2 className="card-title"><CalendarIcon size={20}/> Bugünün Takvimi</h2>
            <div className="calendar-grid">
              {hours.map(hour => {
                const hourApps = tenant.appointments.filter(a => a.startAt.getHours() === hour);
                return (
                  <div key={hour} className="time-slot">
                    <div className="time-label">{String(hour).padStart(2, "0")}:00</div>
                    <div className="stack">
                      {hourApps.length > 0 ? (
                        hourApps.map(app => (
                          <div key={app.id} className="appointment-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <strong>{app.customer.name || app.customer.phone}</strong>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                  {app.service.name} • {app.staff.name} • {formatDateTime(app.startAt).split(' ')[1]}
                                </p>
                              </div>
                              {app.status === AppointmentStatus.BOOKED && (
                                <form action={cancelAppointmentAction}>
                                  <input type="hidden" name="appointmentId" value={app.id} />
                                  <button type="submit" className="icon-btn" style={{ width: '32px', height: '32px', color: 'var(--danger)' }}>
                                    <Trash2 size={16} />
                                  </button>
                                </form>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="appointment-card available" data-action="new-app" data-time={datetimeLocalValue(new Date(new Date().setHours(hour, 0, 0, 0)))} style={{ cursor: 'pointer' }}>
                          <PlusCircle size={18} style={{ marginRight: '8px' }} /> Boş Saat
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card" id="new-app-form">
            <h2 className="card-title"><PlusCircle size={20}/> Yeni Randevu Ekle</h2>
            <form action={createManualAppointmentAction} className="stack">
              <div className="form-group">
                <label>Müşteri Telefon</label>
                <input className="input-field" name="phone" type="tel" placeholder="05..." required />
              </div>
              <div className="form-group">
                <label>Müşteri Adı</label>
                <input className="input-field" name="customerName" />
              </div>
              <div className="form-group">
                <label>Hizmet</label>
                <select className="input-field" name="serviceId" required>
                  {activeServices.map(s => <option key={s.id} value={s.id}>{s.name} - {formatMoney(s.priceCents)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Personel</label>
                <select className="input-field" name="staffId" required>
                  {activeStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tarih & Saat</label>
                <input id="new-app-time" className="input-field" name="startAt" type="datetime-local" defaultValue={datetimeLocalValue()} required />
              </div>
              <button className="btn" type="submit" disabled={activeServices.length === 0 || activeStaff.length === 0}>
                Randevuyu Kaydet
              </button>
            </form>
          </section>
        </div>

        {/* TAB: CUSTOMERS & MESSAGES */}
        <div id="tab-customers" className="tab-content">
          <section className="card">
            <h2 className="card-title"><UsersIcon size={20}/> Müşteriler & Mesajlar</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>Müşterileri hızlıca arayın, WhatsApp'tan yazın ve sesli not bırakın.</p>
            
            <div className="stack" style={{ gap: '0' }}>
              {tenant.customers.map(customer => {
                const cleanPhone = customer.phone.replace(/\D/g, "");
                return (
                  <div key={customer.id} className="customer-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="customer-info">
                        <h4>{customer.name || customer.phone}</h4>
                        <p>{customer.phone}</p>
                      </div>
                      <div className="customer-actions">
                        <a href={`https://wa.me/${cleanPhone}`} target="_blank" className="icon-btn whatsapp"><MessageCircle size={20} /></a>
                        <a href={`tel:+${cleanPhone}`} className="icon-btn phone"><PhoneCall size={20} /></a>
                      </div>
                    </div>
                    
                    <div className="stack" style={{ gap: '8px' }}>
                      {customer.notes.map(note => (
                        <div key={note.id} style={{ background: 'var(--bg)', padding: '8px 12px', borderRadius: '8px', fontSize: '13px' }}>
                          {note.note}
                        </div>
                      ))}
                      <form action={createCustomerNoteAction} style={{ position: 'relative' }}>
                        <input type="hidden" name="customerId" value={customer.id} />
                        <textarea id={`note-${customer.id}`} className="input-field" name="note" placeholder="Müşteri hakkında not ekle..." style={{ minHeight: '60px', paddingRight: '50px' }} required></textarea>
                        <button type="button" className="record-btn" data-action="record" data-target={`note-${customer.id}`} title="Sesle yazdır">
                          <Mic size={18} />
                        </button>
                        <button className="btn secondary mt-4" type="submit" style={{ padding: '8px' }}>Notu Kaydet</button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* TAB: SETTINGS & CONNECTION */}
        <div id="tab-settings" className="tab-content">
          <section className="card">
            <h2 className="card-title"><Smartphone size={20}/> WhatsApp Bağlantısı</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <strong>Durum:</strong> {statusPill(tenant.whatsappSession?.status)}
            </div>
            
            {tenant.whatsappSession?.status === WhatsAppStatus.CONNECTED ? (
              <div className="pill ok" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
                Bağlı Numara: {tenant.whatsappSession.connectedPhone}
              </div>
            ) : (
              <div className="stack">
                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                  WhatsApp'ı bağlamak için numaranızı girip 8 haneli bir kod alabilirsiniz.
                </p>
                <form action={requestPairingCodeAction} className="stack">
                  <div className="form-group">
                    <label>Telefon Numaranız</label>
                    <input className="input-field" name="pairingPhone" type="tel" placeholder="90555..." required />
                  </div>
                  <button className="btn" type="submit">Kod İste</button>
                </form>

                {tenant.whatsappSession?.pairingCodePhone && !tenant.whatsappSession?.pairingCode && (
                  <div className="pill warn" style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '12px' }}>
                    Kod bekleniyor... (Birkaç saniye sürebilir, sayfayı yenileyin)
                  </div>
                )}

                {tenant.whatsappSession?.pairingCode && (
                  <div style={{ background: 'var(--surface-strong)', padding: '16px', borderRadius: '12px', textAlign: 'center', marginTop: '12px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>WhatsApp bildirimine tıklayıp bu kodu girin:</p>
                    <div style={{ fontSize: '32px', fontWeight: '800', letterSpacing: '4px', color: 'var(--primary)' }}>
                      {tenant.whatsappSession.pairingCode}
                    </div>
                  </div>
                )}

                {tenant.whatsappSession?.lastError && (
                   <p className="pill danger mt-4" style={{ width: '100%', justifyContent: 'center' }}>Hata: {tenant.whatsappSession.lastError}</p>
                )}

                <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '24px 0' }} />
                
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center' }}>Veya QR kodu taratın</p>
                {tenant.whatsappSession?.qrDataUrl ? (
                  <div style={{ textAlign: 'center', marginTop: '12px' }}>
                    <img src={tenant.whatsappSession.qrDataUrl} alt="WhatsApp QR" style={{ width: '200px', height: '200px', borderRadius: '12px' }} />
                  </div>
                ) : (
                  <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', marginTop: '12px' }}>QR kod henüz hazır değil.</p>
                )}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="card-title"><SettingsIcon size={20}/> İşletme Ayarları</h2>
            <form action={updateTenantSettingsAction} className="stack">
              <div className="form-group"><label>Ad</label><input className="input-field" name="name" defaultValue={tenant.name} required /></div>
              <div className="form-group"><label>Telefon</label><input className="input-field" name="phone" defaultValue={tenant.phone ?? ""} /></div>
              <div className="form-group"><label>Karşılama Mesajı</label><textarea className="input-field" name="greetingMessage" defaultValue={tenant.greetingMessage} /></div>
              <button className="btn" type="submit">Ayarları Kaydet</button>
            </form>
          </section>
        </div>
      </div>

      <nav className="bottom-nav">
        <button id="nav-calendar" className="nav-item active" data-tab="calendar">
          <div className="icon-wrap"><CalendarIcon size={24} /></div>
          <span>Takvim</span>
        </button>
        <button id="nav-customers" className="nav-item" data-tab="customers">
          <div className="icon-wrap"><UsersIcon size={24} /></div>
          <span>Müşteriler</span>
        </button>
        <button id="nav-settings" className="nav-item" data-tab="settings">
          <div className="icon-wrap"><SettingsIcon size={24} /></div>
          <span>Ayarlar</span>
        </button>
      </nav>

      {/* Client-side logic for tabs and speech dictation */}
      <script dangerouslySetInnerHTML={{ __html: `
        document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
          btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + tab).classList.add('active');
            this.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
        });

        document.querySelectorAll('[data-action="new-app"]').forEach(el => {
          el.addEventListener('click', function() {
             document.getElementById('new-app-time').value = this.getAttribute('data-time');
             document.getElementById('new-app-form').scrollIntoView({behavior: 'smooth'});
          });
        });
        
        document.querySelectorAll('[data-action="record"]').forEach(el => {
          el.addEventListener('click', function() {
             if (window.startRecording) {
               window.startRecording(this, this.getAttribute('data-target'));
             }
          });
        });

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          window.startRecording = function(btn, inputId) {
             const recognition = new SpeechRecognition();
             recognition.lang = 'tr-TR';
             recognition.continuous = false;
             
             const input = document.getElementById(inputId);
             btn.classList.add('recording');
             
             recognition.start();
             
             recognition.onresult = function(e) {
                const transcript = e.results[0][0].transcript;
                input.value += (input.value ? " " : "") + transcript;
             };
             
             recognition.onend = function() {
                btn.classList.remove('recording');
             };
             
             recognition.onerror = function() {
                btn.classList.remove('recording');
             };
          }
        } else {
          // Hide record buttons if Speech API is not supported
          document.querySelectorAll('.record-btn').forEach(btn => btn.style.display = 'none');
        }
      ` }} />
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;

  if (user.role === UserRole.OWNER) {
    return <OwnerDashboard notice={params?.notice} error={params?.error} />;
  }

  if (!user.tenantId) {
    return (
      <div className="page" style={{ padding: '20px', textAlign: 'center' }}>
        <p className="pill danger">Kullanıcı için işletme bağlantısı eksik.</p>
      </div>
    );
  }

  return <TenantDashboard tenantId={user.tenantId} notice={params?.notice} error={params?.error} />;
}
