import dotenv from "dotenv";

dotenv.config({
    path: `./.env`
})

import connectToDB from "./db/connectToDB.js";
import app from "./app.js";


connectToDB()
.then(()=>{
    app.listen(8000, ()=>{
        console.log("Server is running on port 8000");
    })
})
.catch((err)=>{
    console.log(err);
})