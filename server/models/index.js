const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { norm } = require('../services/direcciones');

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const ROLES = ['Administrador', 'Carga', 'Consulta'];
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
    origen: { type: String, enum: ['excel', 'manual'], default: 'manual' },
    lotImportacion: { type: String, index: true },
    creadoPor: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
edificioSchema.index({ campana: 1, direccionNorm: 1 }, { unique: true });

const documentoSchema = new Schema(
  {
    edificio: { type: ObjectId, ref: 'Edificio', required: true, index: true },
    tipo: { type: ObjectId, ref: 'TipoDocumento', required: true },
    presente: { type: Boolean, default: false },
    fechaEmision: Date,
    fechaVencimiento: Date,
    nroReferencia: { type: String, default: '', trim: true },
    observaciones: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);
documentoSchema.index({ edificio: 1, tipo: 1 }, { unique: true });

const actaVinculadaSchema = new Schema(
  {
    edificio: { type: ObjectId, ref: 'Edificio', required: true, index: true },
    numero: { type: String, required: true, trim: true },
    tipo: { type: String, enum: ['acta', 'expediente'], default: 'acta' },
    fecha: Date,
    motivos: [{ type: ObjectId, ref: 'MotivoInfraccion' }],
    estado: { type: String, default: '', trim: true },
    observaciones: { type: String, default: '', trim: true },
    origen: { type: String, enum: ['manual', 'excel'], default: 'manual' },
    lotImportacion: { type: String, index: true },
  },
  { timestamps: true }
);
actaVinculadaSchema.index({ edificio: 1, numero: 1, tipo: 1 }, { unique: true });

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
  ActaVinculada: mongoose.model('ActaVinculada', actaVinculadaSchema),
  Inspeccion: mongoose.model('Inspeccion', inspeccionSchema),
  GeoCache: mongoose.model('GeoCache', geoCacheSchema),
  AuditLog: mongoose.model('AuditLog', auditSchema),
  norm,
};
