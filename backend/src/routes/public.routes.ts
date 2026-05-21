import { Router } from 'express'
import { prisma } from '../config/prisma.js'

export const publicRouter = Router()

/** 랜딩·마케팅용 공개 통계 (인증 불필요) */
publicRouter.get('/stats', async (_req, res, next) => {
  try {
    const userCount = await prisma.user.count()
    res.status(200).json({
      userCount,
      betaOpenedAt: '2026-05-20',
    })
  } catch (error) {
    next(error)
  }
})
