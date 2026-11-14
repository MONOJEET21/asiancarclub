import jwt from 'jsonwebtoken';
export function auth(req,res,next){try{const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');if(!token) return res.status(401).json({message:'Please sign in'});req.user=jwt.verify(token,process.env.JWT_SECRET);next()}catch{return res.status(401).json({message:'Session expired. Please sign in again.'})}}
export function admin(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({message:'Admin access required'});next()}
