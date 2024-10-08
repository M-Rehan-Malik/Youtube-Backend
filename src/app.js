import express from "express"
const app = express();

import cors from "cors"
import cookieParser from "cookie-parser";

app.use(cors());

app.use(express.json({limit: "16kb"}));
app.use(express.urlencoded({extended: true}));
app.use(cookieParser());
app.use(express.static('public'))

// routes 
import userRouter from "./routes/user.routes.js"



app.use("/api/v1/user", userRouter);

export default app

