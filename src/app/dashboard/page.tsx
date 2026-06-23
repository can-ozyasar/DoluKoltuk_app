import { AppointmentStatus, UserRole, WhatsAppStatus } from "@prisma/client";
import {
  cancelAppointmentAction,
  createCustomerNoteAction,
  createManualAppointmentAction,
  createTenantAction,
  updateTenantSettingsAction,
  updateWorkingHoursAction,
  upsertServiceAction,
  upsertStaffAction
} from "@/app/dashboard/actions";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney, minuteToLabel, weekdayName } from "@/lib/format";
import { prisma } from "@/lib/prisma";

function statusPill(status?: WhatsAppStatus) {
  if (status === WhatsAppStatus.CONNECTED) {
    return <span className="pill ok">Bagli</span>;
  }
  if (status === WhatsAppStatus.QR_READY || status === WhatsAppStatus.AUTHENTICATED) {
    return <span className="pill warn">QR hazir</span>;
  }
  if (status === WhatsAppStatus.FAILED) {
    return <span className="pill danger">Hata</span>;
  }
  return <span className="pill">Bagli degil</span>;
}

function datetimeLocalValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function DashboardShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="page">
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <span className="eyebrow">DoluKoltuk</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <form className="logout-form" action="/api/logout" method="post">
            <button className="btn secondary" type="submit">
              Cikis
            </button>
          </form>
        </header>
        {children}
      </div>
    </main>
  );
}

async function OwnerDashboard({ notice, error }: { notice?: string; error?: string }) {
  const tenants = await prisma.tenant.findMany({
    include: {
      whatsappSession: true,
      users: {
        where: { role: UserRole.TENANT_ADMIN },
        take: 1
      },
      _count: {
        select: {
          appointments: true,
          customers: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <DashboardShell title="Sistem sahibi paneli" subtitle="Isletmeleri ve WhatsApp baglanti durumlarini tek ekrandan takip edin.">
      <div className="stack">
        {notice ? <p className="notice">{notice}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}

        <section className="card">
          <div className="section-title">
            <div>
              <h2>Yeni isletme daveti</h2>
              <p className="section-note">Admin bilgileri isletmenin panel girisi icin kullanilir.</p>
            </div>
          </div>
          <form action={createTenantAction} className="stack">
            <div className="form-grid three">
              <label className="field">
                <span>Isletme adi</span>
                <input name="name" placeholder="Moda Kuafor" required />
              </label>
              <label className="field">
                <span>Slug</span>
                <input name="slug" placeholder="moda-kuafor" />
              </label>
              <label className="field">
                <span>Telefon</span>
                <input name="phone" placeholder="+90 555 000 00 00" />
              </label>
              <label className="field full">
                <span>Adres</span>
                <input name="address" placeholder="Cadde, no, ilce / il" />
              </label>
              <label className="field">
                <span>Admin email</span>
                <input name="email" type="email" required />
              </label>
              <label className="field">
                <span>Admin sifre</span>
                <input name="password" type="password" minLength={8} required />
              </label>
            </div>
            <div className="actions">
              <button className="btn" type="submit">
                Isletme olustur
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <div className="section-title">
            <h2>Isletmeler</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Isletme</th>
                <th>Admin</th>
                <th>WhatsApp</th>
                <th>Randevu</th>
                <th>Musteri</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td>
                    <strong>{tenant.name}</strong>
                    <div className="muted">{tenant.slug}</div>
                  </td>
                  <td>{tenant.users[0]?.email ?? "-"}</td>
                  <td>{statusPill(tenant.whatsappSession?.status)}</td>
                  <td>{tenant._count.appointments}</td>
                  <td>{tenant._count.customers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </DashboardShell>
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
        where: {
          startAt: { gte: new Date(Date.now() - 2 * 60 * 60_000) }
        },
        include: {
          service: true,
          staff: true,
          customer: true
        },
        orderBy: { startAt: "asc" },
        take: 50
      },
      customers: {
        include: {
          notes: { orderBy: { createdAt: "desc" }, take: 3 },
          appointments: {
            include: { service: true },
            orderBy: { startAt: "desc" },
            take: 1
          }
        },
        orderBy: { updatedAt: "desc" },
        take: 12
      }
    }
  });

  const activeServices = tenant.services.filter((service) => service.active);
  const activeStaff = tenant.staff.filter((staff) => staff.active);
  const bookedToday = tenant.appointments.filter(
    (appointment) =>
      appointment.status === AppointmentStatus.BOOKED &&
      appointment.startAt.toDateString() === new Date().toDateString()
  ).length;

  return (
    <DashboardShell title={tenant.name} subtitle="Gunluk randevular, WhatsApp baglantisi ve salon ayarlari.">
      <div className="dashboard-flow">
        {notice ? <p className="notice">{notice}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}

        <nav className="quick-nav" aria-label="Panel bolumleri">
          <a href="#randevular">Randevular</a>
          <a href="#whatsapp">WhatsApp</a>
          <a href="#hizmetler">Hizmetler</a>
          <a href="#personel">Personel</a>
          <a href="#musteriler">Musteriler</a>
        </nav>

        <section className="grid three metric-strip">
          <div className="card metric-card">
            <span className="label">WhatsApp</span>
            <div>{statusPill(tenant.whatsappSession?.status)}</div>
            <p className="muted">Son guncelleme: {tenant.whatsappSession?.updatedAt ? formatDateTime(tenant.whatsappSession.updatedAt) : "-"}</p>
          </div>
          <div className="card metric-card">
            <span className="label">Bugunku randevu</span>
            <strong className="metric-value">{bookedToday}</strong>
            <p className="muted">Aktif personel: {activeStaff.length}</p>
          </div>
          <div className="card metric-card">
            <span className="label">Aktif hizmet</span>
            <strong className="metric-value">{activeServices.length}</strong>
            <p className="muted">Kayitli musteri: {tenant.customers.length}</p>
          </div>
        </section>

        <section className="grid two setup-workspace" id="whatsapp">
          <div className="card">
            <div className="section-title">
              <div>
                <h2>WhatsApp QR</h2>
                <p className="section-note">Baglanti durumu ve QR kodu.</p>
              </div>
              {statusPill(tenant.whatsappSession?.status)}
            </div>
            <div className="qr-box">
              {tenant.whatsappSession?.qrDataUrl ? (
                <img src={tenant.whatsappSession.qrDataUrl} alt="WhatsApp QR kodu" />
              ) : (
                <p className="muted">QR hazir degil.</p>
              )}
              {tenant.whatsappSession?.connectedPhone ? <span className="pill ok">{tenant.whatsappSession.connectedPhone}</span> : null}
              {tenant.whatsappSession?.lastError ? <p className="notice error">{tenant.whatsappSession.lastError}</p> : null}
            </div>
          </div>

          <div className="card">
            <div className="section-title">
              <h2>Isletme ayarlari</h2>
            </div>
            <form action={updateTenantSettingsAction} className="stack">
              <div className="form-grid">
                <label className="field">
                  <span>Ad</span>
                  <input name="name" defaultValue={tenant.name} required />
                </label>
                <label className="field">
                  <span>Telefon</span>
                  <input name="phone" defaultValue={tenant.phone ?? ""} />
                </label>
                <label className="field full">
                  <span>Adres</span>
                  <input name="address" defaultValue={tenant.address ?? ""} />
                </label>
                <label className="field full">
                  <span>Karsilama mesaji</span>
                  <textarea name="greetingMessage" defaultValue={tenant.greetingMessage} />
                </label>
                <label className="field full">
                  <span>Mesai disi mesaji</span>
                  <textarea name="afterHoursMessage" defaultValue={tenant.afterHoursMessage} />
                </label>
              </div>
              <div className="actions">
                <button className="btn" type="submit">
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="grid two catalog-workspace" id="hizmetler">
          <div className="card">
            <div className="section-title">
              <h2>Hizmetler</h2>
            </div>
            <div className="stack">
              {tenant.services.map((service) => (
                <form key={service.id} action={upsertServiceAction} className="stack">
                  <input type="hidden" name="id" value={service.id} />
                  <div className="form-grid three">
                    <label className="field">
                      <span>Ad</span>
                      <input name="name" defaultValue={service.name} required />
                    </label>
                    <label className="field">
                      <span>Dakika</span>
                      <input name="durationMinutes" type="number" min={15} step={15} defaultValue={service.durationMinutes} required />
                    </label>
                    <label className="field">
                      <span>Fiyat TL</span>
                      <input name="price" type="number" min={0} step="0.01" defaultValue={service.priceCents / 100} />
                    </label>
                  </div>
                  <label className="field">
                    <span>
                      <input type="checkbox" name="active" defaultChecked={service.active} /> Aktif
                    </span>
                  </label>
                  <div className="actions">
                    <button className="btn secondary" type="submit">
                      Hizmeti kaydet
                    </button>
                  </div>
                </form>
              ))}
              <form action={upsertServiceAction} className="stack">
                <div className="form-grid three">
                  <label className="field">
                    <span>Yeni hizmet</span>
                    <input name="name" placeholder="Fön" required />
                  </label>
                  <label className="field">
                    <span>Dakika</span>
                    <input name="durationMinutes" type="number" min={15} step={15} defaultValue={45} required />
                  </label>
                  <label className="field">
                    <span>Fiyat TL</span>
                    <input name="price" type="number" min={0} step="0.01" defaultValue={0} />
                  </label>
                </div>
                <div className="actions">
                  <button className="btn" type="submit">
                    Hizmet ekle
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="card" id="personel">
            <div className="section-title">
              <h2>Personel</h2>
            </div>
            <div className="stack">
              {tenant.staff.map((staff) => (
                <form key={staff.id} action={upsertStaffAction} className="stack">
                  <input type="hidden" name="id" value={staff.id} />
                  <div className="form-grid">
                    <label className="field">
                      <span>Ad</span>
                      <input name="name" defaultValue={staff.name} required />
                    </label>
                    <label className="field">
                      <span>Durum</span>
                      <span>
                        <input type="checkbox" name="active" defaultChecked={staff.active} /> Aktif
                      </span>
                    </label>
                  </div>
                  <div className="actions">
                    <button className="btn secondary" type="submit">
                      Personeli kaydet
                    </button>
                  </div>
                </form>
              ))}
              <form action={upsertStaffAction} className="stack">
                <label className="field">
                  <span>Yeni personel</span>
                  <input name="name" placeholder="Merve" required />
                </label>
                <div className="actions">
                  <button className="btn" type="submit">
                    Personel ekle
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>

        <section className="card hours-workspace">
          <div className="section-title">
            <h2>Personel calisma saatleri</h2>
          </div>
          <div className="grid two">
            {tenant.staff.map((staff) => {
              const byDay = new Map(staff.workingHours.map((hour) => [hour.weekday, hour]));
              return (
                <form key={staff.id} action={updateWorkingHoursAction} className="stack">
                  <input type="hidden" name="staffId" value={staff.id} />
                  <h3>{staff.name}</h3>
                  {[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
                    const hour = byDay.get(weekday);
                    return (
                      <div className="hours-grid" key={weekday}>
                        <strong>{weekdayName(weekday)}</strong>
                        <input name={`start-${weekday}`} type="time" defaultValue={minuteToLabel(hour?.startMinute ?? 9 * 60)} />
                        <input name={`end-${weekday}`} type="time" defaultValue={minuteToLabel(hour?.endMinute ?? 18 * 60)} />
                        <label>
                          <input name={`closed-${weekday}`} type="checkbox" defaultChecked={hour?.closed ?? weekday === 0} /> Kapali
                        </label>
                      </div>
                    );
                  })}
                  <div className="actions">
                    <button className="btn secondary" type="submit">
                      Saatleri kaydet
                    </button>
                  </div>
                </form>
              );
            })}
          </div>
        </section>

        <section className="grid two primary-workspace" id="randevular">
          <div className="card">
            <div className="section-title">
              <div>
                <h2>Randevu ekle</h2>
                <p className="section-note">Telefonla gelen talepler icin.</p>
              </div>
            </div>
            <form action={createManualAppointmentAction} className="stack">
              <div className="form-grid">
                <label className="field">
                  <span>Musteri telefon</span>
                  <input name="phone" inputMode="tel" placeholder="905551112233@c.us veya +90..." required />
                </label>
                <label className="field">
                  <span>Musteri adi</span>
                  <input name="customerName" />
                </label>
                <label className="field">
                  <span>Hizmet</span>
                  <select name="serviceId" required>
                    {activeServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} - {formatMoney(service.priceCents)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Personel</span>
                  <select name="staffId" required>
                    {activeStaff.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field full">
                  <span>Tarih saat</span>
                  <input name="startAt" type="datetime-local" defaultValue={datetimeLocalValue(new Date(Date.now() + 60 * 60_000))} required />
                </label>
              </div>
              <div className="actions">
                <button className="btn" type="submit" disabled={activeServices.length === 0 || activeStaff.length === 0}>
                  Randevu ekle
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="section-title">
              <h2>Yaklasan randevular</h2>
            </div>
            <div className="stack appointment-list">
              {tenant.appointments.length === 0 ? <div className="empty-state">Henuz randevu yok.</div> : null}
              {tenant.appointments.map((appointment) => (
                <div className="item" key={appointment.id}>
                  <div className="section-title">
                    <div>
                      <strong>{formatDateTime(appointment.startAt)}</strong>
                      <p className="muted">
                        {appointment.service.name} - {appointment.staff.name} - {appointment.customer.name ?? appointment.customer.phone}
                      </p>
                    </div>
                    {appointment.status === AppointmentStatus.BOOKED ? <span className="pill ok">Aktif</span> : <span className="pill danger">Iptal</span>}
                  </div>
                  {appointment.status === AppointmentStatus.BOOKED ? (
                    <form action={cancelAppointmentAction}>
                      <input type="hidden" name="appointmentId" value={appointment.id} />
                      <button className="btn danger" type="submit">
                        Iptal et
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card customers-workspace" id="musteriler">
          <div className="section-title">
            <h2>Musteri gecmisi ve notlar</h2>
          </div>
          <div className="grid three">
            {tenant.customers.map((customer) => (
              <div className="item" key={customer.id}>
                <h3>{customer.name ?? customer.phone}</h3>
                <p className="muted">{customer.phone}</p>
                <p>
                  Son islem:{" "}
                  {customer.appointments[0]
                    ? `${customer.appointments[0].service.name} - ${formatDateTime(customer.appointments[0].startAt)}`
                    : "-"}
                </p>
                <div className="stack">
                  {customer.notes.map((note) => (
                    <p className="notice" key={note.id}>
                      {note.note}
                    </p>
                  ))}
                  <form action={createCustomerNoteAction} className="stack">
                    <input type="hidden" name="customerId" value={customer.id} />
                    <textarea name="note" placeholder="Musteri notu" required />
                    <button className="btn secondary" type="submit">
                      Not ekle
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  if (user.role === UserRole.OWNER) {
    return <OwnerDashboard notice={params?.notice} error={params?.error} />;
  }

  if (!user.tenantId) {
    return (
      <DashboardShell title="Panel" subtitle="Bu kullanici bir isletmeye bagli degil.">
        <p className="notice error">Kullanici icin isletme baglantisi eksik.</p>
      </DashboardShell>
    );
  }

  return <TenantDashboard tenantId={user.tenantId} notice={params?.notice} error={params?.error} />;
}
