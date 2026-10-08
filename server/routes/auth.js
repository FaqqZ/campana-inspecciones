const router = require('express').Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { User, ROLES } = require('../models');
const { protect, authorize, audit } = require('../middleware/auth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Demasiados intentos, probá de nuevo en unos minutos' },
});

const publico = (u) => ({ id: u._id, nombres: u.nombres, apellidos: u.apellidos, username: u.username, role: u.role });

router.post('/login', loginLimiter, async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const user = await User.findOne({ username }).select('+password');
  if (!user || !user.activo || !(await user.comparePassword(String(req.body.password || '')))) {
    return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
  }
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: publico(user) });
});

router.get('/me', protect, (req, res) => res.json(publico(req.user)));

// ---- Gestión de usuarios (solo Administrador) ----
const users = require('express').Router();

// Usuarios a los que se puede asignar una infracción (cualquier usuario autenticado)
users.get('/asignables', protect, async (req, res) => {
  const lista = await User.find({ activo: true }).sort('apellidos nombres');
  res.json(lista.map((u) => ({ id: u._id, nombres: u.nombres, apellidos: u.apellidos, role: u.role })));
});

users.use(protect, authorize());

users.get('/', async (req, res) => res.json(await User.find().sort('apellidos')));

users.post(
  '/',
  body('username').trim().notEmpty(),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  body('role').isIn(ROLES),
  body('nombres').trim().notEmpty(),
  body('apellidos').trim().notEmpty(),
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ message: errs.array()[0].msg || 'Datos inválidos' });
    try {
      const { nombres, apellidos, username, password, role } = req.body;
      const u = await User.create({ nombres, apellidos, username, password, role });
      audit('crear', 'User', u._id, req.user);
      res.status(201).json(await User.findById(u._id));
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ message: 'Ese usuario ya existe' });
      throw e;
    }
  }
);

users.patch('/:id', async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ message: 'No encontrado' });
  if (req.body.role !== undefined && !ROLES.includes(req.body.role)) return res.status(400).json({ message: 'Rol inválido' });
  ['nombres', 'apellidos', 'role', 'activo'].forEach((k) => {
    if (req.body[k] !== undefined) u[k] = req.body[k];
  });
  if (req.body.password) {
    if (String(req.body.password).length < 8)
      return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
    u.password = req.body.password;
  }
  await u.save();
  audit('editar', 'User', u._id, req.user);
  res.json(await User.findById(u._id));
});

module.exports = { auth: router, users };
