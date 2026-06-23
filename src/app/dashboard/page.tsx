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
import { formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { 
  Calendar as CalendarIcon, 
  Users as UsersIcon, 
  Settings as SettingsIcon,
  PhoneCall,
  MessageCircle,
  Mic,
  ChevronLeft,
  LogOut,
  Trash2,
  Plus
} from "lucide-react";

function statusPill(status?: WhatsAppStatus) {
  if (status === WhatsAppStatus.CONNECTED) return <span className="status-pill ok">Bağlı</span>;
  if (status === WhatsAppStatus.QR_READY || status === WhatsAppStatus.AUTHENTICATED) return <span className="status-pill warn">Bekleniyor</span>;
  if (status === WhatsAppStatus.FAILED) return <span className="status-pill danger">Hata</span>;
  return <span className="status-pill">Bağlı değil</span>;
}

function datetimeLocalValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

async function TenantDashboard({ tenantId, notice, error }: { tenantId: string; notice?: string; error?: string }) {
  // Fetch 7 days of appointments
  const todayStart = new Date(new Date().setHours(0,0,0,0));
  const sevenDaysLater = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  
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
        where: { startAt: { gte: todayStart, lte: sevenDaysLater } },
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

  // Generate the next 7 days for the Top Tabs
  const days = Array.from({length: 7}).map((_, i) => {
    const d = new Date(todayStart.getTime() + i * 24 * 60 * 60 * 1000);
    let label = "";
    if (i === 0) label = "Bugün";
    else if (i === 1) label = "Yarın";
    else label = dayNames[d.getDay()];
    return { date: d, label, id: `day-${i}` };
  });

  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

  return (
    <>
      {/* PREMIUM HEADER (Always visible like a native app) */}
      <div className="app-header">
        <div className="header-top">
          <div className="header-title">
            <ChevronLeft size={24}/> {tenant.name}
          </div>
          <div className="header-actions">
            <form action="/api/logout" method="POST" style={{margin: 0, padding: 0, display: 'flex'}}>
              <button type="submit" style={{background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center'}}>
                <LogOut size={22} style={{color: 'var(--primary)'}}/>
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="main-container">
        
        {/* TAB: CALENDAR (Default) */}
        <div id="tab-calendar" className="tab-content active">
          
          {/* Top Tabs (Scrollable) */}
          <div className="top-tabs-container">
            <div className="top-tabs">
              {days.map((day, i) => (
                <div key={day.id} className={`top-tab ${i === 0 ? 'active' : ''}`} data-day-trigger={day.id} style={{cursor: 'pointer'}}>
                  {day.label}
                </div>
              ))}
            </div>
          </div>

          <div className="content-area">
            {notice && <div className="status-pill ok mb-4" style={{width: '100%', justifyContent: 'center'}}>{notice}</div>}
            {error && <div className="status-pill danger mb-4" style={{width: '100%', justifyContent: 'center'}}>{error}</div>}

            {days.map((day, i) => {
              const dayApps = tenant.appointments.filter(a => a.startAt.toDateString() === day.date.toDateString());
              
              return (
                <div key={day.id} id={`content-${day.id}`} className={`sub-tab-content ${i === 0 ? 'active' : ''}`}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                    <h3 style={{color: 'var(--text-main)', fontSize: '18px'}}>{day.label} Randevuları</h3>
                    <button className="status-pill ok" data-action="new-app" data-time={datetimeLocalValue(new Date(day.date.setHours(9,0,0,0)))}>
                      <Plus size={14} style={{marginRight: '4px'}}/> Ekle
                    </button>
                  </div>

                  {hours.map(hour => {
                    const hourApps = dayApps.filter(a => a.startAt.getHours() === hour);
                    
                    if (hourApps.length === 0) return null; // Only show hours with appointments to look like flight tickets

                    return hourApps.map(app => (
                      <div key={app.id} className="ticket-card">
                        <div className="ticket-top">
                          <div>
                            <div className="time-large">
                              {String(app.startAt.getHours()).padStart(2, "0")}:{String(app.startAt.getMinutes()).padStart(2, "0")} 
                              <span style={{fontSize: '14px', color: 'var(--text-muted)', marginLeft: '8px'}}>
                                - {String(app.endAt.getHours()).padStart(2, "0")}:{String(app.endAt.getMinutes()).padStart(2, "0")}
                              </span>
                            </div>
                            <div className="service-name">{app.service.name} • Uzman: {app.staff.name}</div>
                          </div>
                          <div className="price-tag">{app.service.priceCents > 0 ? formatMoney(app.service.priceCents) : "Ücretsiz"}</div>
                        </div>
                        <div className="ticket-bottom">
                          <div>
                            <div style={{fontWeight: 600, fontSize: '15px'}}>{app.customer.name || app.customer.phone}</div>
                            {app.status === AppointmentStatus.CANCELLED && <div className="status-pill danger mt-4">İptal Edildi</div>}
                          </div>
                          <div style={{display: 'flex', gap: '8px'}}>
                            <a href={`tel:+${app.customer.phone.replace(/\D/g, "")}`} className="action-circle phone"><PhoneCall size={18}/></a>
                            {app.status === AppointmentStatus.BOOKED && (
                              <form action={cancelAppointmentAction}>
                                <input type="hidden" name="appointmentId" value={app.id} />
                                <button type="submit" className="action-circle" style={{background: 'var(--danger-light)', color: 'var(--danger)'}}>
                                  <Trash2 size={18}/>
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      </div>
                    ));
                  })}
                  {dayApps.length === 0 && (
                    <div style={{textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)'}}>
                      <CalendarIcon size={48} style={{opacity: 0.2, marginBottom: '16px'}}/>
                      <p>Bu güne ait randevu bulunmuyor.</p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Hidden Add Form Modal (Inline for now) */}
            <div className="card mt-4" id="new-app-form">
              <h2 className="card-title">Yeni Randevu</h2>
              <form action={createManualAppointmentAction} className="stack">
                <div className="form-group">
                  <label>Müşteri Telefon</label>
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-soft)', padding: '0 12px', borderRadius: '12px', border: '1px solid var(--line)'}}>
                    <span style={{fontWeight: 600, color: 'var(--text-muted)'}}>+90</span>
                    <input className="input-field" name="phone" type="tel" placeholder="5XX XXX XX XX" pattern="[0-9]{10}" maxLength={10} required style={{border: 'none', background: 'transparent', paddingLeft: 0, flex: 1, boxShadow: 'none'}} />
                  </div>
                </div>
                <div className="form-group"><label>Müşteri Adı</label><input className="input-field" name="customerName" /></div>
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
                <div className="form-group"><label>Tarih & Saat</label><input id="new-app-time" className="input-field" name="startAt" type="datetime-local" defaultValue={datetimeLocalValue()} required /></div>
                <button className="btn" type="submit">Randevu Ekle</button>
              </form>
            </div>

          </div>
        </div>

        {/* TAB: CUSTOMERS & MESSAGES */}
        <div id="tab-customers" className="tab-content">
          <div className="content-area">
            <div style={{marginBottom: '24px'}}>
              <h2 style={{fontSize: '20px', fontWeight: 700}}>Müşteriler</h2>
              <p style={{fontSize: '14px', color: 'var(--text-muted)'}}>Müşterileri arayın, not bırakın (sesli komutla).</p>
            </div>
            
            <div className="stack">
              {tenant.customers.map(customer => {
                const cleanPhone = customer.phone.replace(/\D/g, "");
                return (
                  <div key={customer.id} className="card" style={{padding: '0', overflow: 'hidden'}}>
                    <div style={{padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)'}}>
                      <div>
                        <div style={{fontWeight: 700, fontSize: '16px'}}>{customer.name || "İsimsiz Müşteri"}</div>
                        <div style={{fontSize: '13px', color: 'var(--text-muted)'}}>{customer.phone}</div>
                      </div>
                      <div style={{display: 'flex', gap: '8px'}}>
                        <a href={`https://wa.me/${cleanPhone}`} target="_blank" className="action-circle whatsapp"><MessageCircle size={18}/></a>
                        <a href={`tel:+${cleanPhone}`} className="action-circle phone"><PhoneCall size={18}/></a>
                      </div>
                    </div>
                    <div style={{padding: '16px', background: 'var(--surface-soft)'}}>
                      {customer.notes.map(note => (
                        <div key={note.id} style={{fontSize: '13px', background: 'var(--surface)', padding: '8px', borderRadius: '8px', marginBottom: '8px', border: '1px solid var(--line)'}}>
                          {note.note}
                        </div>
                      ))}
                      <form action={createCustomerNoteAction} style={{position: 'relative', marginTop: '12px'}}>
                        <input type="hidden" name="customerId" value={customer.id} />
                        <textarea id={`note-${customer.id}`} className="input-field" name="note" placeholder="Not yazın..." style={{minHeight: '44px', paddingRight: '50px'}} required></textarea>
                        <button type="button" data-action="record" data-target={`note-${customer.id}`} style={{position: 'absolute', right: '4px', bottom: '4px', width: '36px', height: '36px', borderRadius: '18px', background: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)'}}>
                          <Mic size={16}/>
                        </button>
                        <button className="btn mt-4" type="submit" style={{padding: '10px', fontSize: '14px'}}>Kaydet</button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* TAB: SETTINGS & CONNECTION */}
        <div id="tab-settings" className="tab-content">
          <div className="content-area">
            <section className="card">
              <h2 className="card-title">WhatsApp Bağlantısı</h2>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                <span style={{fontSize: '14px'}}>Durum</span>
                {statusPill(tenant.whatsappSession?.status)}
              </div>

              {tenant.whatsappSession?.status === WhatsAppStatus.CONNECTED ? (
                <div className="status-pill ok" style={{width: '100%', justifyContent: 'center', padding: '12px'}}>Bağlı Numara: {tenant.whatsappSession.connectedPhone}</div>
              ) : (
                <div className="stack">
                  <p style={{fontSize: '13px', color: 'var(--text-muted)'}}>WhatsApp'ı bağlamak için numaranızı girip 8 haneli kod alın.</p>
                  <form action={requestPairingCodeAction} className="stack">
                    <div className="form-group">
                      <label>Telefon Numaranız</label>
                      <div style={{display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-soft)', padding: '0 12px', borderRadius: '12px', border: '1px solid var(--line)'}}>
                        <span style={{fontWeight: 600, color: 'var(--text-muted)'}}>+90</span>
                        <input className="input-field" name="pairingPhone" type="tel" placeholder="5XX XXX XX XX" pattern="[0-9]{10}" maxLength={10} required style={{border: 'none', background: 'transparent', paddingLeft: 0, flex: 1, boxShadow: 'none'}} />
                      </div>
                    </div>
                    <button className="btn" type="submit">Kod İste</button>
                  </form>

                  {tenant.whatsappSession?.pairingCodePhone && !tenant.whatsappSession?.pairingCode && (
                    <div className="status-pill warn" style={{width: '100%', justifyContent: 'center', padding: '12px'}}>Kod bekleniyor... (Yenileyin)</div>
                  )}

                  {tenant.whatsappSession?.pairingCode && (
                    <div style={{background: 'var(--bg-color)', padding: '16px', borderRadius: '12px', textAlign: 'center'}}>
                      <p style={{fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px'}}>Bildirime tıklayıp kodu girin:</p>
                      <div 
                        data-action="copy"
                        style={{fontSize: '32px', fontWeight: 800, letterSpacing: '4px', color: 'var(--primary)', cursor: 'pointer', display: 'inline-block'}}
                        title="Kopyalamak için tıklayın"
                      >
                        {tenant.whatsappSession.pairingCode}
                      </div>
                      <p style={{fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', opacity: 0.7}}>Kopyalamak için koda dokunun</p>
                    </div>
                  )}
                  {tenant.whatsappSession?.lastError && <p className="status-pill danger" style={{width: '100%', justifyContent: 'center'}}>{tenant.whatsappSession.lastError}</p>}
                </div>
              )}
            </section>
          </div>
        </div>

      </div>

      {/* BOTTOM NAVIGATION */}
      <nav className="bottom-nav">
        <button className="nav-item active" data-tab="calendar">
          <CalendarIcon size={24} />
          <span>Takvim</span>
        </button>
        <button className="nav-item" data-tab="customers">
          <UsersIcon size={24} />
          <span>Müşteriler</span>
        </button>
        <button className="nav-item" data-tab="settings">
          <SettingsIcon size={24} />
          <span>Ayarlar</span>
        </button>
      </nav>

      {/* INTERACTIVE SCRIPT */}
      <script dangerouslySetInnerHTML={{ __html: `
        // Main Tabs Logic
        document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
          btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.bottom-nav .nav-item').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + tab).classList.add('active');
            this.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
        });

        // Top Tabs (Days) Logic
        document.querySelectorAll('.top-tab').forEach(btn => {
          btn.addEventListener('click', function() {
            const dayId = this.getAttribute('data-day-trigger');
            document.querySelectorAll('.top-tab').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.sub-tab-content').forEach(el => el.classList.remove('active'));
            document.getElementById('content-' + dayId).classList.add('active');
            this.classList.add('active');
          });
        });

        // New App Scroll Logic
        document.querySelectorAll('[data-action="new-app"]').forEach(el => {
          el.addEventListener('click', function() {
             document.getElementById('new-app-time').value = this.getAttribute('data-time');
             document.getElementById('new-app-form').scrollIntoView({behavior: 'smooth'});
          });
        });
        
        // Speech Dictation Logic
        document.querySelectorAll('[data-action="record"]').forEach(el => {
          el.addEventListener('click', function() {
             if (window.startRecording) {
               window.startRecording(this, this.getAttribute('data-target'));
             } else {
               alert("Tarayıcınız sesli komutu desteklemiyor.");
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
             btn.style.color = "var(--danger)"; // Visual feedback
             
             recognition.start();
             recognition.onresult = function(e) {
                const transcript = e.results[0][0].transcript;
                input.value += (input.value ? " " : "") + transcript;
             };
             recognition.onend = function() { btn.style.color = "var(--text-muted)"; };
             recognition.onerror = function() { btn.style.color = "var(--text-muted)"; };
          }
        }
        
        // Copy to clipboard logic
        document.querySelectorAll('[data-action="copy"]').forEach(el => {
          el.addEventListener('click', function() {
             const text = this.innerText;
             if (text === "Kopyalandı!") return;
             navigator.clipboard.writeText(text);
             this.innerText = "Kopyalandı!";
             setTimeout(() => { this.innerText = text; }, 2000);
          });
        });
      ` }} />
    </>
  );
}

// Fallbacks for Owner and Unassigned user
function OwnerDashboardFallback() {
  return <div className="app-header"><div className="header-top"><div className="header-title">Sistem Sahibi</div></div></div>;
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;

  if (user.role === UserRole.OWNER) {
    return <OwnerDashboardFallback />;
  }

  if (!user.tenantId) {
    return <div style={{padding: '20px', textAlign: 'center'}}>İşletme bağlantısı eksik.</div>;
  }

  return <TenantDashboard tenantId={user.tenantId} notice={params?.notice} error={params?.error} />;
}
