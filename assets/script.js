document.addEventListener('DOMContentLoaded', function() {
  var refs = document.querySelectorAll('.refresh');
  function animate(timestamp) {
    window.requestAnimationFrame(animate);
    var scrolled = window.scrollY / window.innerHeight;
    var spinDeg = (timestamp / 18) % 360;
    var persp = 40 + (40 * scrolled);
    var transString = 'rotateX('+persp+'deg) rotateZ('+spinDeg+'deg)';
    for (var i = 0; i < refs.length; i++) {
      refs[i].style.transform = transString;
      refs[i].style.webkitTransform = transString;
    }
  }
  window.requestAnimationFrame(animate);
});
