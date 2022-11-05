const videoAnimation = document.querySelectorAll('.vidAnimation');
const step = document.querySelectorAll('.stp');


document.addEventListener('scroll',()=>{

    let posScroll = window.scrollY;
    for(var i = 0; i < 3; i++){    
        if( i == 2){
             if(posScroll >= step[i].offsetTop - 230){
             videoAnimation[i].classList.add('active');
         }else{
             videoAnimation[i].classList.remove('active');
         }
        }else{
            if( (posScroll >= step[i].offsetTop - 230) && (posScroll <= step[i+1].offsetTop) ){
                videoAnimation[i].classList.add('active');
            }else{
                videoAnimation[i].classList.remove('active');
            }
        }
    }


})