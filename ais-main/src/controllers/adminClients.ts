import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getClients = async (req: Request, res: Response) => {
  try {
    console.log('🔧 [AdminClientsController] Получение всех клиентов');
    
    const clients = await prisma.client.findMany({
      where: {
        deletedAt: null, // Только неудаленные клиенты
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          }
        },
        _count: {
          select: {
            lessons: true,
            payments: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`✅ [AdminClientsController] Найдено ${clients.length} клиентов`);
    res.json(clients);
  } catch (error) {
    console.error('❌ [AdminClientsController] Ошибка:', error);
    res.status(500).json({ 
      error: 'Ошибка при получении клиентов',
      details: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

export const getClientById = async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.id);
    
    if (isNaN(clientId)) {
      return res.status(400).json({ error: 'Неверный ID клиента' });
    }

    console.log(`🔧 [AdminClientsController] Получение клиента ID: ${clientId}`);
    
    const client = await prisma.client.findUnique({
      where: { 
        id: clientId,
        deletedAt: null // Только неудаленные
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          }
        },
        lessons: {
          orderBy: {
            startTime: 'desc'
          },
          take: 50 // Ограничиваем количество
        },
        payments: {
          orderBy: {
            dateTime: 'desc'
          },
          take: 50 // Ограничиваем количество
        }
      }
    });

    if (!client) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    console.log(`✅ [AdminClientsController] Клиент ${clientId} найден`);
    res.json(client);
  } catch (error) {
    console.error('❌ [AdminClientsController] Ошибка:', error);
    res.status(500).json({ 
      error: 'Ошибка при получении клиента',
      details: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};
