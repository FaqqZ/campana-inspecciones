const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { norm } = require('../services/direcciones');

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const { ROLES } = require('../config/permisos');
const GEO_ESTADOS = ['pendiente', 'ok', 'aproximado', 'fallido', 'manual'];
const ESTADOS_INSPECCION = ['pendiente', 'inspeccionado', 'observado', 'regularizado'];

// ---------- Usuarios ----------
const userSchema = new Schema(
  {
    nombres: { type: String, required: true, trim: true },
    apellidos: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLES, required: true },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);
userSchema.pre('save', async function hash(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

// ---------- Campaña ----------
const campanaSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '', trim: true },
    fechaInicio: Date,
    fechaFin: Date,
    activa: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ---------- Catálogos ----------
const catalogo = (extra = {}) => {
  const s = new Schema(
    {
      nombre: { type: String, required: true, trim: true },
      nombreNorm: { type: String, required: true, unique: true },
      activo: { type: Boolean, default: true },
      ...extra,
    },
    { timestamps: true }
  );
  s.pre('validate', function setNorm(next) {
    this.nombreNorm = norm(this.nombre);
    next();
  });
  return s;
};

const inspectorSchema = catalogo({ legajo: { type: String, default: '', trim: true } });
const motivoSchema = catalogo({ descripcion: { type: String, default: '', trim: true } });
const estadoSchema = catalogo({
  descripcion: { type: String, default: '', trim: true },
  esInicial: { type: Boolean, default: false }, // estado con el que nace una infracción
  requiereComentario: { type: Boolean, default: false }, // el pase a este estado exige un comentario
  esFinal: { type: Boolean, default: false }, // estado con el que se cierra al generar el expediente
  orden: { type: Number, default: 0 },
});
const oficinaSchema = catalogo({
  descripcion: { type: String, default: '', trim: true },
  esInicial: { type: Boolean, default: false }, // oficina donde nace una infracción
  orden: { type: Number, default: 0 },
});
const tipoDocumentoSchema = catalogo({
  requerido: { type: Boolean, default: true },
  tieneVencimiento: { type: Boolean, default: false },
  motivoAsociado: { type: ObjectId, ref: 'MotivoInfraccion', default: null },
  orden: { type: Number, default: 0 },
});

// ---------- Edificios ----------
const edificioSchema = new Schema(
  {
    campana: { type: ObjectId, ref: 'Campana', required: true, index: true },
    direccionOriginal: { type: String, required: true, trim: true },
    calle: { type: String, required: true, trim: true },
    calleNorm: { type: String, required: true, index: true },
    numero: { type: Number, default: null },
    direccionNorm: { type: String, required: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    geoEstado: { type: String, enum: GEO_ESTADOS, default: 'pendiente', index: true },
    geoDisplayName: { type: String, default: '' },
    titular: { type: String, default: '', trim: true },
    uso: { type: String, default: '', trim: true },
    observaciones: { type: String, default: '', trim: true },
    estadoInspeccion: { type: String, enum: ESTADOS_INSPECCION, default: 'pendiente', index: true },
    // Datos de Catastro (cuando el edificio viene de un cruce)
    padron: { type: String, default: '', trim: true },
    estadoObra: { type: String, default: '', trim: true },
    calleOrigen: { type: String, default: '', trim: true },
    alturaOriginal: { type: String, default: '', trim: true },
    esquina: { type: String, default: '', trim: true },
    conclusionCruce: { type: String, default: '', trim: true },
    mismaCalleOtraAltura: { type: Boolean, default: false },
    enListadoSinCert: { type: Boolean, default: false },
    // Edificio oculto: no aparece en el mapa, listados, indicadores ni geocodificación (sus datos se conservan)
    oculto: { type: Boolean, default: false },
    ocultoMotivo: { type: String, default: '' },
    // Estado anterior de los datos de Catastro, para revertir la última actualización del cruce ({ lote, datos, cert })
    catastroPrevio: { type: Schema.Types.Mixed, default: undefined },
    informe: { type: String, default: '' }, // texto del informe de inspección (Word de edificios sin final de obra)
    informeLote: { type: String, default: '' },
    origen: { type: String, enum: ['excel', 'manual'], default: 'manual' },
    lotImportacion: { type: String, index: true },
    creadoPor: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
edificioSchema.index({ campana: 1, direccionNorm: 1 }, { unique: true });
// Los edificios ocultos se excluyen de toda consulta salvo que se pida .setOptions({ incluirOcultos: true }) (importaciones).
edificioSchema.pre(['find', 'findOne', 'countDocuments', 'distinct', 'findOneAndUpdate', 'findOneAndDelete'], function () {
  if (this.getOptions().incluirOcultos) return;
  if (this.getFilter().oculto === undefined) this.where({ oculto: { $ne: true } });
});
edificioSchema.pre('aggregate', function () {
  if (this.options?.incluirOcultos) return;
  this.pipeline().unshift({ $match: { oculto: { $ne: true } } });
});

const documentoSchema = new Schema(
  {
    edificio: { type: ObjectId, ref: 'Edificio', required: true, index: true },
    tipo: { type: ObjectId, ref: 'TipoDocumento', required: true },
    presente: { type: Boolean, default: false },
    fechaEmision: Date,
    fechaVencimiento: Date,
    nroReferencia: { type: String, default: '', trim: true },
    observaciones: { type: String, default: '', trim: true },
    lotImportacion: { type: String, index: true },
  },
  { timestamps: true }
);
documentoSchema.index({ edificio: 1, tipo: 1 }, { unique: true });

const fotoEdificioSchema = new Schema(
  {
    edificio: { type: ObjectId, ref: 'Edificio', required: true, index: true },
    archivo: { type: String, required: true }, // nombre en disco (server/uploads/edificios/<edificio>/)
    nombreOriginal: { type: String, default: '' },
    tipo: { type: String, default: 'image/jpeg' },
    tamano: { type: Number, default: 0 },
    orden: { type: Number, default: 0 },
    descripcion: { type: String, default: '', trim: true },
    lotImportacion: { type: String, index: true },
    creadoPor: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const notificacionSchema = new Schema(
  {
    edificio: { type: ObjectId, ref: 'Edificio', required: true, index: true },
    fechaNotificacion: { type: Date, required: true },
    plazoDias: { type: Number, default: null, min: 1, max: 3650 }, // null: notificado sin plazo registrado todavía
    fechaVencimiento: { type: Date, default: null, index: true }, // vigente (con prórrogas)
    observaciones: { type: String, default: '', trim: true }, // última novedad de la planilla
    boleta: { type: String, default: '', trim: true, index: true },
    razonSocial: { type: String, default: '', trim: true },
    inspector: { type: String, default: '', trim: true },
    plazoOriginal: { type: String, default: '', trim: true }, // tal como figura en la planilla ("72 hs vence 9/10/26")
    vencimientoOriginal: { type: Date, default: null }, // antes de las prórrogas; fechaVencimiento es el vigente
    prorroga: { type: Boolean, default: false },
    resultado: { type: String, enum: ['', 'presento', 'acta'], default: '' }, // presentó documentación / pasó a acta
    origen: { type: String, enum: ['excel', 'manual'], default: 'manual' },
    lotImportacion: { type: String, index: true },
    creadoPor: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
notificacionSchema.index({ edificio: 1, fechaNotificacion: -1 });

const movimientoSchema = new Schema(
  {
    fecha: { type: Date, default: Date.now },
    oficinaOrigen: { type: ObjectId, ref: 'Oficina' },
    oficinaDestino: { type: ObjectId, ref: 'Oficina', required: true },
    estado: { type: ObjectId, ref: 'Estado' },
    por: { type: ObjectId, ref: 'User', required: true },
    comentarios: { type: String, default: '' },
  },
  { _id: false }
);

const infraccionSchema = new Schema(
  {
    numeroActa: { type: String, required: true, unique: true, trim: true },
    edificio: { type: ObjectId, ref: 'Edificio', required: true, index: true },
    infractor: { type: String, default: '', trim: true },
    descripcion: { type: String, default: '', trim: true }, // motivo tal como figura en el acta
    normativa: { type: String, default: '', trim: true },
    inspectoresActuantes: [{ type: ObjectId, ref: 'Inspector' }],
    motivosInfraccion: [{ type: ObjectId, ref: 'MotivoInfraccion' }],
    fechaInfraccion: { type: Date, required: true, index: true },
    estado: { type: ObjectId, ref: 'Estado', required: true },
    oficinaActual: { type: ObjectId, ref: 'Oficina', required: true },
    asignadoA: { type: ObjectId, ref: 'User', default: null },
    observaciones: { type: Boolean, default: false },
    detalleObservaciones: { type: String, default: '', trim: true },
    historialMovimientos: [movimientoSchema],
    expediente: {
      numero: { type: String, default: '' },
      fecha: Date,
      generadoPor: { type: ObjectId, ref: 'User' },
    },
    eliminado: { type: Boolean, default: false, index: true },
    motivoEliminacion: { type: String, default: '' },
    eliminadoPor: { type: ObjectId, ref: 'User' },
    origen: { type: String, enum: ['manual', 'excel'], default: 'manual' },
    lotImportacion: { type: String, index: true },
    creadoPor: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
infraccionSchema.index({ estado: 1, oficinaActual: 1 });

const inspeccionSchema = new Schema(
  {
    edificio: { type: ObjectId, ref: 'Edificio', required: true, index: true },
    fecha: { type: Date, required: true },
    inspector: { type: ObjectId, ref: 'Inspector' },
    resultado: { type: String, enum: ESTADOS_INSPECCION.slice(1), required: true },
    observaciones: { type: String, default: '', trim: true },
    creadoPor: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// ---------- Caché de geocodificación ----------
const geoCacheSchema = new Schema(
  {
    queryNorm: { type: String, required: true, unique: true },
    lat: Number,
    lng: Number,
    displayName: String,
    precision: { type: String, enum: ['ok', 'aproximado', 'fallido'], required: true },
  },
  { timestamps: true }
);

// ---------- Auditoría ----------
const auditSchema = new Schema(
  {
    accion: { type: String, required: true },
    entidad: { type: String, required: true },
    entidadId: String,
    usuario: { type: ObjectId, ref: 'User' },
    detalle: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = {
  ROLES,
  GEO_ESTADOS,
  ESTADOS_INSPECCION,
  User: mongoose.model('User', userSchema),
  Campana: mongoose.model('Campana', campanaSchema),
  Inspector: mongoose.model('Inspector', inspectorSchema),
  MotivoInfraccion: mongoose.model('MotivoInfraccion', motivoSchema),
  TipoDocumento: mongoose.model('TipoDocumento', tipoDocumentoSchema),
  Edificio: mongoose.model('Edificio', edificioSchema),
  DocumentoEdificio: mongoose.model('DocumentoEdificio', documentoSchema),
  FotoEdificio: mongoose.model('FotoEdificio', fotoEdificioSchema),
  Notificacion: mongoose.model('Notificacion', notificacionSchema),
  Estado: mongoose.model('Estado', estadoSchema),
  Oficina: mongoose.model('Oficina', oficinaSchema),
  Infraccion: mongoose.model('Infraccion', infraccionSchema),
  Inspeccion: mongoose.model('Inspeccion', inspeccionSchema),
  GeoCache: mongoose.model('GeoCache', geoCacheSchema),
  AuditLog: mongoose.model('AuditLog', auditSchema),
  norm,
};
