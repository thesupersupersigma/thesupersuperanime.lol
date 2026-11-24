import { getAuth } from '@/server/auth'

const handler = (req: Request) => getAuth().handler(req)

export { handler as GET, handler as POST }
