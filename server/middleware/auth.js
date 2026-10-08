const jwt = require('jsonwebtoken');
const { User, AuditLog } = require('../models');

const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No autenticado' });
  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(id);
    if (!user || !user.activo) return res.status(401).json({ message: 'Usuario inválido' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Sesión inválida o vencida' });
  }
};

// Administrador siempre pasa. authorize() sin argumentos = solo Administrador.
const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    if (req.user.role === 'Administrador' || roles.includes(req.user.role)) return next();
    res.status(403).json({ message: 'Usted no tiene permisos para realizar esta acción' });
  };

const audit = (accion, entidad, entidadId, usuario, detalle = '') =>
  AuditLog.create({ accion, entidad, entidadId: String(entidadId || ''), usuario: usuario?._id, detalle }).catch(
    () => {}
  );

module.exports = { protect, authorize, audit };
