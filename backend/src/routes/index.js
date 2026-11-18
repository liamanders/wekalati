import { Router } from 'express'
import multer from 'multer'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { login } from '../controllers/authController.js'
import { createAgency, deleteAgency, listAgencies, updateAgency } from '../controllers/agencyController.js'
import { createUser, deleteUser, listUsers, resetUserPassword, updateUser } from '../controllers/userController.js'
import { createDelivery, getDeliveryScreenshot, listDeliveries } from '../controllers/deliveryController.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) return callback(new Error('Screenshot must be a PNG, JPEG, or WEBP image'))
    callback(null, true)
  },
})

router.post('/auth/login', login)
router.get('/auth/me', requireAuth, (req, res) => res.json({ id: req.auth.sub, role: req.auth.role, agencyId: req.auth.agencyId }))

router.get('/agencies', requireAuth, requireRole('supervisor', 'admin'), listAgencies)
router.post('/agencies', requireAuth, requireRole('supervisor'), createAgency)
router.patch('/agencies/:id', requireAuth, requireRole('supervisor'), updateAgency)
router.delete('/agencies/:id', requireAuth, requireRole('supervisor'), deleteAgency)

router.get('/users', requireAuth, listUsers)
router.post('/users', requireAuth, requireRole('supervisor', 'admin'), createUser)
router.patch('/users/:id/password', requireAuth, requireRole('supervisor'), resetUserPassword)
router.patch('/users/:id', requireAuth, updateUser)
router.delete('/users/:id', requireAuth, requireRole('supervisor', 'admin'), deleteUser)

router.get('/deliveries', requireAuth, listDeliveries)
router.get('/deliveries/:id/screenshot', requireAuth, getDeliveryScreenshot)
router.get('/users/:userId/deliveries', requireAuth, requireRole('supervisor', 'admin'), listDeliveries)
router.post('/deliveries', requireAuth, requireRole('user'), upload.single('screenshot'), createDelivery)

export default router
